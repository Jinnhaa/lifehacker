import { createHash, randomUUID } from "node:crypto";
import { AgentBootstrapService } from "./agent-bootstrap.js";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class SupabaseAgentRunRecorder {
    sql;
    bootstrap;
    constructor(sql) {
        this.sql = sql;
        this.bootstrap = new AgentBootstrapService(sql);
    }
    async findCompleted(userId, agentTemplateKey, artifactType, triggerId) {
        const rows = await this.sql `
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
    async recordCompleted(input) {
        const instance = await this.bootstrap.ensureAgentInstance(input.userId, input.agentTemplateKey, input.requiredScopeId);
        if (!instance)
            return;
        await this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.agentTemplateKey}:${input.triggerId}`},0))`;
            const existing = await tx `
        select exists(
          select 1 from public.context_packages c
          join public.agent_runs r on r.context_package_id=c.id and r.user_id=c.user_id
          join public.agent_instances i on i.id=r.agent_instance_id and i.user_id=r.user_id
          join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
          where c.user_id=${input.userId} and c.source_refs->>'triggerId'=${input.triggerId}
            and t.template_key=${input.agentTemplateKey}
        ) present
      `;
            if (existing[0]?.present)
                return;
            const correlationId = input.correlationId ?? randomUUID();
            const packages = await tx `
        insert into public.context_packages(user_id,scope_id,payload,source_refs,policy_version)
        values(${input.userId},${instance.homeScopeId},${tx.json(input.contextPayload)},
          ${tx.json({ triggerId: input.triggerId, source: input.source, correlationId, contextHash: hash(input.contextPayload),
                workstyleProfileRevisions: input.workstyleProfileRevisions ?? [] })},
          ${input.policyVersion}) returning id
      `;
            const runs = await tx `
        insert into public.agent_runs(user_id,agent_instance_id,context_package_id,template_version,policy_version,status,
          max_turns,max_tool_calls,started_at,ended_at)
        values(${input.userId},${instance.id},${packages[0].id},${instance.templateVersion},${input.policyVersion},'completed',1,0,
          ${input.startedAt},${input.completedAt}) returning id
      `;
            await tx `
        insert into public.artifacts(user_id,artifact_type,title,source_agent_run_id,content_text,content_hash)
        values(${input.userId},${input.artifactType},${input.requestKind},${runs[0].id},${input.reply},${hash(input.reply)})
      `;
        });
    }
}
//# sourceMappingURL=supabase-agent-run-recorder.js.map