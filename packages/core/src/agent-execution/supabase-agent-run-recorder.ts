import { createHash, randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";

export interface AgentExecutionTraceInput {
  readonly userId: UserId;
  readonly agentTemplateKey: string;
  readonly artifactType: string;
  readonly triggerId: string;
  readonly source: string;
  readonly requestKind: string;
  readonly contextPayload: Readonly<Record<string, unknown>>;
  readonly reply: string;
  readonly policyVersion: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly correlationId?: string;
  readonly requiredScopeId?: string;
}

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class SupabaseAgentRunRecorder {
  constructor(private readonly sql: Sql) {}

  async findCompleted(userId: UserId, agentTemplateKey: string, artifactType: string, triggerId: string): Promise<string | null> {
    const rows = await this.sql<{ content_text: string }[]>`
      select a.content_text from public.context_packages c
      join public.agent_runs r on r.context_package_id=c.id and r.user_id=c.user_id
      join public.agent_instances i on i.id=r.agent_instance_id and i.user_id=r.user_id
      join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
      join public.artifacts a on a.source_agent_run_id=r.id and a.user_id=r.user_id
      where c.user_id=${userId} and c.source_refs->>'triggerId'=${triggerId}
        and t.template_key=${agentTemplateKey} and r.status='completed' and a.artifact_type=${artifactType}
      order by r.created_at desc limit 1
    `;
    return rows[0]?.content_text ?? null;
  }

  async recordCompleted(input: AgentExecutionTraceInput): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.agentTemplateKey}:${input.triggerId}`},0))`;
      const existing = await tx<{ present: boolean }[]>`
        select exists(
          select 1 from public.context_packages c
          join public.agent_runs r on r.context_package_id=c.id and r.user_id=c.user_id
          join public.agent_instances i on i.id=r.agent_instance_id and i.user_id=r.user_id
          join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
          where c.user_id=${input.userId} and c.source_refs->>'triggerId'=${input.triggerId}
            and t.template_key=${input.agentTemplateKey}
        ) present
      `;
      if (existing[0]?.present) return;
      const scopeId = input.requiredScopeId ?? null;
      const instances = await tx<{ id: string; template_version: string; home_scope_id: string }[]>`
        select i.id,i.template_version,i.home_scope_id from public.agent_instances i
        join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
        where i.user_id=${input.userId} and i.status='active' and t.template_key=${input.agentTemplateKey} and t.active=true
          and (${scopeId}::uuid is null or i.home_scope_id=${scopeId}::uuid)
        order by i.created_at desc limit 1
      `;
      const instance = instances[0];
      if (!instance) return;
      const correlationId = input.correlationId ?? randomUUID();
      const packages = await tx<{ id: string }[]>`
        insert into public.context_packages(user_id,scope_id,payload,source_refs,policy_version)
        values(${input.userId},${instance.home_scope_id},${tx.json(input.contextPayload as unknown as JSONValue)},
          ${tx.json({ triggerId: input.triggerId, source: input.source, correlationId, contextHash: hash(input.contextPayload) })},
          ${input.policyVersion}) returning id
      `;
      const runs = await tx<{ id: string }[]>`
        insert into public.agent_runs(user_id,agent_instance_id,context_package_id,template_version,policy_version,status,
          max_turns,max_tool_calls,started_at,ended_at)
        values(${input.userId},${instance.id},${packages[0]!.id},${instance.template_version},${input.policyVersion},'completed',1,0,
          ${input.startedAt},${input.completedAt}) returning id
      `;
      await tx`
        insert into public.artifacts(user_id,artifact_type,title,source_agent_run_id,content_text,content_hash)
        values(${input.userId},${input.artifactType},${input.requestKind},${runs[0]!.id},${input.reply},${hash(input.reply)})
      `;
    });
  }
}
