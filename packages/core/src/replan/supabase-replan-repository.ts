import { createHash } from "node:crypto";
import type { UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import { deriveCurrentAction } from "../execution/current-action.js";
import type { MorningConstraint, MorningPlan, MorningPlanDraft, MorningPlanItemDraft } from "../morning/morning.js";
import type {
  ReplanDecision,
  ReplanPlanItem,
  ReplanPlanState,
  ReplanRepository,
  ReplanRevisionResult,
  ReplanTrigger,
  ReplanWorkflowRun
} from "./replan.js";

interface EventRow { id: string; user_id: string; correlation_id: string; occurred_at: Date; payload: unknown }
interface WorkflowRow {
  id: string; user_id: string; status: string; current_step: string; checkpoint_state: unknown;
  checkpoint_version: number; correlation_id: string;
}
interface PlanRow { id: string; plan_date: string; timezone: string; revision_no: number; status: string; input_snapshot: unknown }
interface PlanItemRow {
  id: string; item_type: "task" | "routine" | "rest" | "buffer"; task_id: string | null;
  recurring_activity_id: string | null; planned_start_at: Date; planned_end_at: Date; planned_minutes: number;
  status: string; title: string | null; task_status: string | null; task_importance: number | null; task_deadline: Date | null;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

const mapTrigger = (row: EventRow): ReplanTrigger => {
  const payload = asRecord(row.payload);
  return {
    id: row.id,
    userId: row.user_id as UserId,
    reason: String(payload.reason) as ReplanTrigger["reason"],
    deltaMinutes: typeof payload.delta_minutes === "number" ? payload.delta_minutes : 0,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at
  };
};

const mapWorkflow = (row: WorkflowRow): ReplanWorkflowRun => {
  const checkpoint = asRecord(row.checkpoint_state);
  return {
    id: row.id,
    userId: row.user_id as UserId,
    status: row.status as ReplanWorkflowRun["status"],
    currentStep: row.current_step as ReplanWorkflowRun["currentStep"],
    checkpointVersion: row.checkpoint_version,
    correlationId: row.correlation_id,
    planDate: String(checkpoint.planDate),
    timeZone: String(checkpoint.timeZone),
    planId: String(checkpoint.planId),
    triggerId: String(checkpoint.triggerId),
    impact: String(checkpoint.impact) as ReplanWorkflowRun["impact"],
    ...(Array.isArray(checkpoint.impactReasons)
      ? { impactReasons: checkpoint.impactReasons.filter((value): value is string => typeof value === "string") }
      : {}),
    ...(typeof checkpoint.lastMessageId === "string" ? { lastMessageId: checkpoint.lastMessageId } : {})
  };
};

const parseIntervals = (value: unknown): { start: Date; end: Date }[] => Array.isArray(value) ? value.flatMap((entry) => {
  const record = asRecord(entry);
  const start = new Date(String(record.start));
  const end = new Date(String(record.end));
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start ? [{ start, end }] : [];
}) : [];

const actionHash = (draft: MorningPlanDraft): string => createHash("sha256").update(JSON.stringify(draft.items.map((item) => ({
  type: item.itemType, taskId: item.taskId ?? null, recurringActivityId: item.recurringActivityId ?? null,
  start: item.start.toISOString(), end: item.end.toISOString(), minutes: item.plannedMinutes
})))).digest("hex");

const weekday = (date: string): number => {
  const value = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return value === 0 ? 7 : value;
};

const addDays = (date: string, count: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};

const periodKey = (date: string, weekStartsOn: number): string => addDays(date, -((weekday(date) - weekStartsOn + 7) % 7));

export class SupabaseReplanRepository implements ReplanRepository {
  constructor(private readonly sql: Sql) {}

  async findLatestPendingTrigger(userId: UserId): Promise<ReplanTrigger | null> {
    const rows = await this.sql<EventRow[]>`
      select e.id,e.user_id,e.correlation_id,e.occurred_at,e.payload from public.domain_events e
      where e.user_id=${userId} and e.event_type='replan_triggered'
        and e.payload->>'reason' in ('task_overrun','task_completed_early','task_blocked','task_switched','manual_replan')
        and not exists (
          select 1 from public.workflow_runs w where w.user_id=e.user_id and w.workflow_type='dynamic_replanning'
            and w.checkpoint_state->>'triggerId'=e.id::text
        )
        and not exists (
          select 1 from public.domain_events handled where handled.user_id=e.user_id
            and handled.event_type='replan_executed' and handled.causation_id=e.id
        )
      order by e.occurred_at desc,e.recorded_at desc limit 1
    `;
    return rows[0] ? mapTrigger(rows[0]) : null;
  }

  async createManualTrigger(userId: UserId, now: Date, messageId: string): Promise<ReplanTrigger> {
    const plans = await this.sql<{ id: string }[]>`
      select id from public.daily_plans where user_id=${userId} and status='approved' order by plan_date desc,revision_no desc limit 1
    `;
    const aggregateId = plans[0]?.id ?? userId;
    const rows = await this.sql<EventRow[]>`
      insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'replan_triggered','daily_plan',${aggregateId},'user',${now},gen_random_uuid(),${`manual-replan:${messageId}`},1,
        ${this.sql.json({ reason: "manual_replan", delta_minutes: 0, replan_executed: false })})
      on conflict(user_id,idempotency_key) do nothing returning id,user_id,correlation_id,occurred_at,payload
    `;
    if (rows[0]) return mapTrigger(rows[0]);
    const existing = await this.sql<EventRow[]>`
      select id,user_id,correlation_id,occurred_at,payload from public.domain_events
      where user_id=${userId} and idempotency_key=${`manual-replan:${messageId}`}
    `;
    if (!existing[0]) throw new Error("Manual replan trigger disappeared");
    return mapTrigger(existing[0]);
  }

  async findPendingApproval(userId: UserId, planDate: string): Promise<ReplanWorkflowRun | null> {
    const rows = await this.sql<WorkflowRow[]>`
      select * from public.workflow_runs where user_id=${userId} and workflow_type='dynamic_replanning'
        and status='waiting_for_user' and current_step='awaiting_approval' and checkpoint_state->>'planDate'=${planDate}
      order by updated_at desc limit 1
    `;
    return rows[0] ? mapWorkflow(rows[0]) : null;
  }

  async findCompletedApprovalByMessage(userId: UserId, planDate: string, messageId: string): Promise<ReplanWorkflowRun | null> {
    const rows = await this.sql<WorkflowRow[]>`
      select * from public.workflow_runs where user_id=${userId} and workflow_type='dynamic_replanning'
        and status='completed' and current_step='completed' and checkpoint_state->>'planDate'=${planDate}
        and checkpoint_state->>'lastMessageId'=${messageId} order by updated_at desc limit 1
    `;
    return rows[0] ? mapWorkflow(rows[0]) : null;
  }

  async findByTrigger(userId: UserId, triggerId: string): Promise<ReplanRevisionResult | null> {
    const rows = await this.sql<WorkflowRow[]>`
      select * from public.workflow_runs where user_id=${userId} and workflow_type='dynamic_replanning'
        and checkpoint_state->>'triggerId'=${triggerId} order by updated_at desc limit 1
    `;
    if (!rows[0]) return null;
    const workflow = mapWorkflow(rows[0]);
    const plan = await this.getPlan(this.sql, userId, workflow.planId);
    return plan ? { workflow, plan, duplicate: true } : null;
  }

  async loadPlanState(userId: UserId, planDate: string): Promise<ReplanPlanState | null> {
    const plans = await this.sql<PlanRow[]>`
      select id,plan_date::text,timezone,revision_no,status,input_snapshot from public.daily_plans
      where user_id=${userId} and plan_date=${planDate} and status='approved' order by revision_no desc limit 1
    `;
    const plan = plans[0];
    if (!plan) return null;
    const items = await this.loadItems(this.sql, userId, plan.id);
    const active = await this.sql<{ task_id: string }[]>`
      select task_id from public.focus_sessions where user_id=${userId} and status='active' limit 1
    `;
    const snapshot = asRecord(plan.input_snapshot);
    const workUntil = new Date(String(snapshot.workUntil));
    if (Number.isNaN(workUntil.getTime())) throw new Error("Approved plan is missing workUntil");
    return {
      planId: plan.id,
      revisionNo: plan.revision_no,
      planDate: plan.plan_date,
      timeZone: plan.timezone,
      workUntil,
      privateIntervals: parseIntervals(snapshot.privateIntervals),
      items,
      activeTaskId: active[0]?.task_id ?? null
    };
  }

  async createRevision(
    trigger: ReplanTrigger,
    stateHash: string,
    previous: ReplanPlanState,
    draft: MorningPlanDraft,
    decision: ReplanDecision,
    now: Date
  ): Promise<ReplanRevisionResult> {
    return this.sql.begin(async (tx) => {
      const existing = await tx<WorkflowRow[]>`
        select * from public.workflow_runs where user_id=${trigger.userId} and idempotency_key=${`replan:${stateHash}`} for update
      `;
      if (existing[0]) {
        const workflow = mapWorkflow(existing[0]);
        const plan = await this.getPlan(tx, trigger.userId, workflow.planId);
        if (!plan) throw new Error("Replan workflow plan missing");
        await this.recordTriggerExecution(tx, trigger, workflow.id, plan.id, now);
        return { workflow, plan, duplicate: true };
      }
      const locked = await tx<PlanRow[]>`
        select id,plan_date::text,timezone,revision_no,status,input_snapshot from public.daily_plans
        where id=${previous.planId} and user_id=${trigger.userId} for update
      `;
      if (!locked[0] || locked[0].status !== "approved") {
        const concurrent = await tx<WorkflowRow[]>`
          select * from public.workflow_runs where user_id=${trigger.userId} and idempotency_key=${`replan:${stateHash}`}
        `;
        if (concurrent[0]) {
          const workflow = mapWorkflow(concurrent[0]);
          const plan = await this.getPlan(tx, trigger.userId, workflow.planId);
          if (!plan) throw new Error("Concurrent replan plan missing");
          await this.recordTriggerExecution(tx, trigger, workflow.id, plan.id, now);
          return { workflow, plan, duplicate: true };
        }
        throw new Error("Approved plan changed before replanning");
      }
      const revisionRows = await tx<{ revision_no: number }[]>`
        select coalesce(max(revision_no),0)::int revision_no from public.daily_plans
        where user_id=${trigger.userId} and plan_date=${previous.planDate}
      `;
      const revisionNo = revisionRows[0]!.revision_no + 1;
      const workflowRows = await tx<WorkflowRow[]>`
        insert into public.workflow_runs(user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at)
        values(${trigger.userId},'dynamic_replanning',${decision.impact === "SMALL_CHANGE" ? "completed" : "waiting_for_user"},
          ${decision.impact === "SMALL_CHANGE" ? "completed" : "awaiting_approval"},'{}',1,${`replan:${stateHash}`},${trigger.correlationId},${now}) returning *
      `;
      const workflowId = workflowRows[0]!.id;
      const snapshot = {
        ...draft.inputSnapshot,
        highlights: draft.highlights,
        triggerId: trigger.id,
        triggerReason: trigger.reason,
        impact: decision.impact,
        impactReasons: decision.reasons,
        fixedEvents: draft.fixedEvents.map((value) => ({
          id: value.id, title: value.title, start: value.start.toISOString(), end: value.end.toISOString(),
          origin: value.origin, constraintType: value.constraintType, hardness: value.hardness, blocksCapacity: value.blocksCapacity
        }))
      };
      const planRows = await tx<PlanRow[]>`
        insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,supersedes_plan_id,input_snapshot,created_by)
        values(${trigger.userId},${previous.planDate},${previous.timeZone},${revisionNo},'pending_approval',${previous.planId},
          ${tx.json(snapshot as JSONValue)},'dynamic_replanning') returning id,plan_date::text,timezone,revision_no,status,input_snapshot
      `;
      const planId = planRows[0]!.id;
      await this.insertItems(tx, trigger.userId, previous.planDate, planId, draft);
      await tx`update public.daily_plans set status='superseded' where id=${previous.planId} and user_id=${trigger.userId} and status='approved'`;
      const checkpoint = {
        planDate: previous.planDate, timeZone: previous.timeZone, planId, triggerId: trigger.id,
        impact: decision.impact, impactReasons: decision.reasons
      };
      await tx`
        update public.workflow_runs set checkpoint_state=${tx.json(checkpoint)},updated_at=${now},
          completed_at=${decision.impact === "SMALL_CHANGE" ? now : null} where id=${workflowId} and user_id=${trigger.userId}
      `;
      if (decision.impact === "SMALL_CHANGE") {
        await tx`
          update public.daily_plans set status='approved',approval_source='rules_engine',approval_reason='small_change',approved_at=${now}
          where id=${planId} and user_id=${trigger.userId}
        `;
      } else {
        await tx`
          insert into public.approval_requests(user_id,workflow_run_id,action_type,action_ref,action_hash,checkpoint_version,status,requested_at,resume_idempotency_key)
          values(${trigger.userId},${workflowId},'approve_daily_plan',${planId},${actionHash(draft)},1,'pending',${now},${`replan-approval:${workflowId}`})
        `;
      }
      await tx`
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
        values(${trigger.userId},'plan_replanned','daily_plan',${planId},'system',${now},${trigger.correlationId},${workflowId},
          ${`plan-replanned:${trigger.id}`},1,${tx.json({ revision_no: revisionNo, trigger_id: trigger.id, reason: trigger.reason, impact: decision.impact, impact_reasons: decision.reasons })})
        on conflict(user_id,idempotency_key) do nothing
      `;
      if (decision.impact === "SMALL_CHANGE") {
        await tx`
          insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
          values(${trigger.userId},'plan_approved','daily_plan',${planId},'system',${now},${trigger.correlationId},${workflowId},
            ${`replan-plan-approved:${planId}`},1,${tx.json({ source: "rules_engine", reason: "small_change" })})
          on conflict(user_id,idempotency_key) do nothing
        `;
      }
      await this.recordTriggerExecution(tx, trigger, workflowId, planId, now);
      const workflow = mapWorkflow({ ...workflowRows[0]!, checkpoint_state: checkpoint });
      const plan = await this.getPlan(tx, trigger.userId, planId);
      if (!plan) throw new Error("Created replan plan missing");
      return { workflow, plan, duplicate: false };
    });
  }

  async deriveCurrentAction(userId: UserId, planDate: string) {
    return deriveCurrentAction(this.sql, userId, planDate);
  }

  async reject(workflow: ReplanWorkflowRun, now: Date, messageId: string): Promise<{ duplicate: boolean }> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<WorkflowRow[]>`
        select * from public.workflow_runs where id=${workflow.id} and user_id=${workflow.userId} for update
      `;
      const current = mapWorkflow(rows[0]!);
      if (current.status === "completed") return { duplicate: true };
      const plans = await tx<{ supersedes_plan_id: string | null }[]>`
        select supersedes_plan_id from public.daily_plans where id=${current.planId} and user_id=${current.userId} for update
      `;
      const previousPlanId = plans[0]?.supersedes_plan_id ?? null;
      await tx`update public.daily_plans set status='superseded' where id=${current.planId} and user_id=${current.userId} and status='pending_approval'`;
      if (previousPlanId) {
        await tx`update public.daily_plans set status='approved' where id=${previousPlanId} and user_id=${current.userId} and status='superseded'`;
      }
      await tx`
        update public.approval_requests set status='rejected',responded_at=${now},responded_by='user',response_payload=${tx.json({ messageId })}
        where user_id=${current.userId} and workflow_run_id=${current.id} and status='pending'
      `;
      await tx`
        update public.workflow_runs set status='completed',current_step='completed',
          checkpoint_state=checkpoint_state || ${tx.json({ lastMessageId: messageId, rejected: true })},
          checkpoint_version=checkpoint_version+1,updated_at=${now},completed_at=${now}
        where id=${current.id} and user_id=${current.userId}
      `;
      await tx`
        insert into public.domain_events(
          user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload
        ) values(${current.userId},'plan_rejected','daily_plan',${current.planId},'user',${now},${current.correlationId},${current.id},
          ${`replan-plan-rejected:${current.id}`},1,${tx.json({ restored_plan_id: previousPlanId })})
        on conflict(user_id,idempotency_key) do nothing
      `;
      return { duplicate: false };
    });
  }

  private async loadItems(sql: Sql, userId: UserId, planId: string): Promise<ReplanPlanItem[]> {
    const rows = await sql<PlanItemRow[]>`
      select i.id,i.item_type,i.task_id,o.recurring_activity_id,i.planned_start_at,i.planned_end_at,i.planned_minutes,i.status,
        coalesce(t.title,a.title,case when i.item_type='buffer' then '버퍼' else '휴식' end) title,
        t.status task_status,t.importance task_importance,least(t.official_deadline,t.internal_deadline) task_deadline
      from public.plan_items i left join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
      left join public.activity_occurrences o on o.id=i.activity_occurrence_id and o.user_id=i.user_id
      left join public.recurring_activities a on a.id=o.recurring_activity_id and a.user_id=o.user_id
      where i.user_id=${userId} and i.daily_plan_id=${planId} and i.planned_start_at is not null and i.planned_end_at is not null
      order by i.position
    `;
    return rows.map((row) => ({
      id: row.id, itemType: row.item_type, title: row.title ?? "계획 항목", plannedMinutes: row.planned_minutes,
      start: row.planned_start_at, end: row.planned_end_at, status: row.status,
      taskStatus: row.task_status, taskImportance: row.task_importance, taskDeadline: row.task_deadline,
      ...(row.task_id ? { taskId: row.task_id } : {}),
      ...(row.recurring_activity_id ? { recurringActivityId: row.recurring_activity_id } : {})
    }));
  }

  private async recordTriggerExecution(
    sql: Sql,
    trigger: ReplanTrigger,
    workflowId: string,
    planId: string,
    now: Date
  ): Promise<void> {
    await sql`
      insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,causation_id,workflow_run_id,idempotency_key,payload_version,payload)
      values(${trigger.userId},'replan_executed','daily_plan',${planId},'system',${now},${trigger.correlationId},${trigger.id},${workflowId},
        ${`replan-executed:${trigger.id}`},1,${sql.json({ trigger_id: trigger.id, reason: trigger.reason })})
      on conflict(user_id,idempotency_key) do nothing
    `;
  }

  private async insertItems(sql: Sql, userId: UserId, planDate: string, planId: string, draft: MorningPlanDraft): Promise<void> {
    const settings = await sql<{ week_starts_on: number }[]>`select week_starts_on from public.user_settings where user_id=${userId}`;
    const period = periodKey(planDate, settings[0]?.week_starts_on ?? 1);
    const occurrences = new Map<string, string>();
    for (const [index, item] of draft.items.entries()) {
      let occurrenceId: string | null = null;
      if (item.itemType === "routine" && item.recurringActivityId) {
        occurrenceId = occurrences.get(item.recurringActivityId) ?? null;
        if (!occurrenceId) {
          const existing = await sql<{ id: string }[]>`
            select id from public.activity_occurrences where user_id=${userId} and recurring_activity_id=${item.recurringActivityId}
              and planned_date=${planDate} and status not in ('cancelled','skipped') order by sequence_no limit 1
          `;
          occurrenceId = existing[0]?.id ?? null;
        }
        if (!occurrenceId) {
          const created = await sql<{ id: string }[]>`
            insert into public.activity_occurrences(user_id,recurring_activity_id,period_key,sequence_no,planned_date,planned_start_at,status)
            select ${userId},${item.recurringActivityId},${period},coalesce(max(sequence_no),0)+1,${planDate},${item.start},'planned'
            from public.activity_occurrences where recurring_activity_id=${item.recurringActivityId} and period_key=${period} returning id
          `;
          occurrenceId = created[0]!.id;
        }
        occurrences.set(item.recurringActivityId, occurrenceId);
      }
      await sql`
        insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,activity_occurrence_id,planned_start_at,planned_end_at,planned_minutes,status)
        values(${userId},${planId},${index + 1},${item.itemType},${item.taskId ?? null},${occurrenceId},${item.start},${item.end},${item.plannedMinutes},'planned')
      `;
    }
  }

  private async getPlan(sql: Sql, userId: UserId, planId: string): Promise<MorningPlan | null> {
    const rows = await sql<PlanRow[]>`
      select id,plan_date::text,timezone,revision_no,status,input_snapshot from public.daily_plans where id=${planId} and user_id=${userId}
    `;
    if (!rows[0]) return null;
    const plan = rows[0];
    const items = await this.loadItems(sql, userId, planId);
    const snapshot = asRecord(plan.input_snapshot);
    const fixedEvents: MorningConstraint[] = Array.isArray(snapshot.fixedEvents) ? snapshot.fixedEvents.flatMap((entry) => {
      const value = asRecord(entry);
      const start = new Date(String(value.start));
      const end = new Date(String(value.end));
      return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? [] : [{
        id: String(value.id), title: typeof value.title === "string" ? value.title : null, start, end,
        origin: String(value.origin), constraintType: String(value.constraintType), hardness: String(value.hardness),
        blocksCapacity: value.blocksCapacity === true
      }];
    }) : [];
    const planItems: MorningPlanItemDraft[] = items.map((item) => ({
      itemType: item.itemType, title: item.title, plannedMinutes: item.plannedMinutes, start: item.start, end: item.end,
      ...(item.taskId ? { taskId: item.taskId } : {}),
      ...(item.recurringActivityId ? { recurringActivityId: item.recurringActivityId } : {})
    }));
    return {
      id: plan.id, revisionNo: plan.revision_no, status: plan.status as MorningPlan["status"], items: planItems, fixedEvents,
      highlights: Array.isArray(snapshot.highlights) ? snapshot.highlights.filter((value): value is string => typeof value === "string") : []
    };
  }
}
