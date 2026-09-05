import { createHash, randomUUID } from "node:crypto";
import { zonedDateTimeToUtc, type UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import { deriveCurrentAction } from "../execution/current-action.js";
import type { MorningRepository } from "../morning/morning.js";
import type { ChiefContext, ChiefContextReader, ChiefRunRecord, ChiefRunRecorder } from "./chief.js";

const addDays = (date: string, count: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};

export class SupabaseChiefContextReader implements ChiefContextReader {
  constructor(private readonly sql: Sql, private readonly observationReader: Pick<MorningRepository, "loadObservation">) {}

  async loadChiefContext(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<ChiefContext> {
    const start = zonedDateTimeToUtc(`${planDate}T00:00:00`, timeZone);
    const end = zonedDateTimeToUtc(`${addDays(planDate, 1)}T00:00:00`, timeZone);
    const [observation, plans, action, focus, replans, settings] = await Promise.all([
      this.observationReader.loadObservation(userId, planDate, timeZone, now),
      this.sql<{ id: string; revision_no: number }[]>`
        select id,revision_no from public.daily_plans
        where user_id=${userId} and plan_date=${planDate} and status='approved'
        order by revision_no desc limit 1
      `,
      deriveCurrentAction(this.sql, userId, planDate),
      this.sql<{ id: string; task_id: string; title: string; started_at: Date }[]>`
        select f.id,f.task_id,t.title,f.started_at from public.focus_sessions f
        join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
        where f.user_id=${userId} and f.status='active' order by f.started_at desc limit 1
      `,
      this.sql<{ present: boolean }[]>`
        select exists(select 1 from public.domain_events where user_id=${userId} and event_type='plan_replanned'
          and occurred_at>=${start} and occurred_at<${end}) present
      `,
      this.sql<{ week_starts_on: number }[]>`select week_starts_on from public.user_settings where user_id=${userId}`
    ]);
    return {
      userId,
      observedAt: now,
      planDate,
      timeZone,
      observation,
      approvedPlan: plans[0] ? { id: plans[0].id, revisionNo: plans[0].revision_no } : null,
      currentAction: action,
      activeFocus: focus[0] ? { id: focus[0].id, taskId: focus[0].task_id, title: focus[0].title, startedAt: focus[0].started_at } : null,
      replannedToday: replans[0]?.present ?? false,
      weekStartsOn: settings[0]?.week_starts_on ?? 1
    };
  }
}

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class SupabaseChiefRunRecorder implements ChiefRunRecorder {
  constructor(private readonly sql: Sql) {}

  async findCompleted(userId: UserId, triggerId: string): Promise<ChiefRunRecord | null> {
    const rows = await this.sql<{ content_text: string }[]>`
      select a.content_text from public.context_packages c
      join public.agent_runs r on r.context_package_id=c.id and r.user_id=c.user_id
      join public.agent_instances i on i.id=r.agent_instance_id and i.user_id=r.user_id
      join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
      join public.artifacts a on a.source_agent_run_id=r.id and a.user_id=r.user_id
      where c.user_id=${userId} and c.source_refs->>'triggerId'=${triggerId}
        and t.template_key='chief' and r.status='completed' and a.artifact_type='chief_response'
      order by r.created_at desc limit 1
    `;
    return rows[0] ? { reply: rows[0].content_text } : null;
  }

  async recordCompleted(input: Parameters<ChiefRunRecorder["recordCompleted"]>[0]): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${input.context.userId}:${input.triggerId}`},0))`;
      const existing = await tx<{ present: boolean }[]>`
        select exists(select 1 from public.context_packages where user_id=${input.context.userId}
          and source_refs->>'triggerId'=${input.triggerId}) present
      `;
      if (existing[0]?.present) return;
      const instances = await tx<{ id: string; template_version: string; home_scope_id: string }[]>`
        select i.id,i.template_version,i.home_scope_id from public.agent_instances i
        join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
        where i.user_id=${input.context.userId} and i.status='active' and t.template_key='chief' and t.active=true
        order by i.created_at desc limit 1
      `;
      const instance = instances[0];
      if (!instance) return;
      const contextPayload = {
        planDate: input.context.planDate,
        approvedPlanId: input.context.approvedPlan?.id ?? null,
        currentAction: input.context.currentAction,
        activeFocusId: input.context.activeFocus?.id ?? null,
        fixedConstraintIds: input.context.observation.constraints.filter((item) => item.blocksCapacity).map((item) => item.id),
        taskIds: input.context.observation.tasks.map((task) => task.id),
        blockedTaskIds: input.context.observation.tasks.filter((task) => task.status === "BLOCKED").map((task) => task.id),
        recurringActivityIds: input.context.observation.recurringActivities.map((activity) => activity.id),
        carryoverTaskIds: input.context.observation.carryoverContext?.taskIds ?? [],
        availablePrincipleIds: input.context.observation.principles?.map((principle) => principle.id) ?? [],
        usedPrincipleIds: input.usedPrincipleIds,
        replannedToday: input.context.replannedToday
      };
      const correlationId = randomUUID();
      const packages = await tx<{ id: string }[]>`
        insert into public.context_packages(user_id,scope_id,payload,source_refs,policy_version)
        values(${input.context.userId},${instance.home_scope_id},${tx.json(contextPayload as unknown as JSONValue)},
          ${tx.json({ triggerId: input.triggerId, source: input.source, correlationId, contextHash: hash(contextPayload) })},'chief-v0.1')
        returning id
      `;
      const runs = await tx<{ id: string }[]>`
        insert into public.agent_runs(user_id,agent_instance_id,context_package_id,template_version,policy_version,status,
          max_turns,max_tool_calls,started_at,ended_at)
        values(${input.context.userId},${instance.id},${packages[0]!.id},${instance.template_version},'chief-v0.1','completed',1,0,
          ${input.startedAt},${input.completedAt}) returning id
      `;
      await tx`
        insert into public.artifacts(user_id,artifact_type,title,source_agent_run_id,content_text,content_hash)
        values(${input.context.userId},'chief_response',${input.requestKind},${runs[0]!.id},${input.reply},${hash(input.reply)})
      `;
    });
  }
}
