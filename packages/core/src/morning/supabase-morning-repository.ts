import { createHash } from "node:crypto";
import { zonedDateTimeToUtc, type UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import type { Task, TaskExecutionMode, TaskStatus } from "../task/task.js";
import type {
  CurrentAction,
  MorningCheckpoint,
  MorningConstraint,
  MorningObservation,
  MorningPlan,
  MorningPlanDraft,
  MorningPlanItemDraft,
  MorningRepository,
  MorningStep,
  MorningWorkflowRun
} from "./morning.js";

interface WorkflowRow {
  id: string; user_id: string; status: string; current_step: string;
  checkpoint_state: unknown; checkpoint_version: number; correlation_id: string;
}

interface PlanRow { id: string; revision_no: number; status: string; input_snapshot: unknown }
interface PlanItemRow {
  item_type: "task" | "routine" | "buffer";
  task_id: string | null; recurring_activity_id: string | null;
  planned_start_at: Date; planned_end_at: Date; planned_minutes: number; title: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

const mapCheckpoint = (value: unknown): MorningCheckpoint => {
  const record = asRecord(value);
  const intervals = Array.isArray(record.privateIntervals) ? record.privateIntervals.flatMap((entry) => {
    const interval = asRecord(entry);
    const start = new Date(String(interval.start));
    const end = new Date(String(interval.end));
    return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? [] : [{ start, end }];
  }) : undefined;
  return {
    planDate: String(record.planDate ?? ""),
    timeZone: String(record.timeZone ?? ""),
    ...(typeof record.workUntil === "string" ? { workUntil: record.workUntil } : {}),
    ...(typeof record.contextReply === "string" ? { contextReply: record.contextReply } : {}),
    ...(intervals && intervals.length > 0 ? { privateIntervals: intervals } : {}),
    ...(typeof record.revisionRequest === "string" ? { revisionRequest: record.revisionRequest } : {}),
    ...(typeof record.planId === "string" ? { planId: record.planId } : {}),
    ...(typeof record.lastMessageId === "string" ? { lastMessageId: record.lastMessageId } : {}),
    ...(Array.isArray(record.excludedTaskIds) ? { excludedTaskIds: record.excludedTaskIds.filter((id): id is string => typeof id === "string") } : {})
  };
};

const checkpointJson = (checkpoint: MorningCheckpoint): JSONValue => ({
  ...checkpoint,
  ...(checkpoint.privateIntervals ? {
    privateIntervals: checkpoint.privateIntervals.map((value) => ({ start: value.start.toISOString(), end: value.end.toISOString() }))
  } : {})
}) as JSONValue;

const mapWorkflow = (row: WorkflowRow): MorningWorkflowRun => ({
  id: row.id,
  userId: row.user_id as UserId,
  status: row.status as MorningWorkflowRun["status"],
  currentStep: row.current_step as MorningStep,
  checkpoint: mapCheckpoint(row.checkpoint_state),
  checkpointVersion: row.checkpoint_version,
  correlationId: row.correlation_id
});

const mapTask = (row: Record<string, unknown>): Task => ({
  id: String(row.id) as Task["id"], userId: String(row.user_id) as UserId,
  workContextId: row.work_context_id === null ? null : String(row.work_context_id),
  objectiveId: row.objective_id === null ? null : String(row.objective_id),
  title: String(row.title), description: row.description === null ? null : String(row.description),
  executionMode: String(row.execution_mode) as TaskExecutionMode,
  officialDeadline: row.official_deadline ? new Date(String(row.official_deadline)) : null,
  internalDeadline: row.internal_deadline ? new Date(String(row.internal_deadline)) : null,
  estimatedMinutes: row.estimated_minutes === null ? null : Number(row.estimated_minutes),
  estimatedUserMinutes: row.estimated_user_minutes === null ? null : Number(row.estimated_user_minutes),
  actualMinutes: Number(row.actual_minutes), importance: Number(row.importance), status: String(row.status) as TaskStatus,
  nextAction: row.next_action === null ? null : String(row.next_action),
  completionCriteria: row.completion_criteria === null ? null : String(row.completion_criteria),
  completionSource: row.completion_source === null ? null : String(row.completion_source),
  createdAt: new Date(String(row.created_at)), completedAt: row.completed_at ? new Date(String(row.completed_at)) : null,
  updatedAt: new Date(String(row.updated_at))
});

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const dateWeekday = (date: string): number => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

const weekRange = (date: string, weekStartsOn: number): { start: string; end: string; periodKey: string } => {
  const delta = (dateWeekday(date) - weekStartsOn + 7) % 7;
  const start = addDays(date, -delta);
  return { start, end: addDays(start, 6), periodKey: start };
};

const planHash = (planId: string, draft: MorningPlanDraft): string => createHash("sha256")
  .update(JSON.stringify({ planId, items: draft.items.map((item) => ({
    type: item.itemType, id: item.taskId ?? item.recurringActivityId ?? null,
    start: item.start.toISOString(), end: item.end.toISOString(), minutes: item.plannedMinutes
  })) }))
  .digest("hex");

export class SupabaseMorningRepository implements MorningRepository {
  constructor(private readonly sql: Sql) {}

  async getOrCreateWorkflow(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<MorningWorkflowRun> {
    const key = `morning:${planDate}`;
    const rows = await this.sql<WorkflowRow[]>`
      insert into public.workflow_runs(
        user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at
      ) values (
        ${userId},'morning','running','observe',${this.sql.json({ planDate, timeZone })},0,${key},gen_random_uuid(),${now}
      ) on conflict(user_id,idempotency_key) do update set updated_at=public.workflow_runs.updated_at
      returning *
    `;
    return mapWorkflow(rows[0]!);
  }

  async findTodayWorkflow(userId: UserId, planDate: string): Promise<MorningWorkflowRun | null> {
    const rows = await this.sql<WorkflowRow[]>`
      select * from public.workflow_runs where user_id=${userId} and idempotency_key=${`morning:${planDate}`} and workflow_type='morning'
    `;
    return rows[0] ? mapWorkflow(rows[0]) : null;
  }

  async loadObservation(userId: UserId, planDate: string, timeZone: string): Promise<MorningObservation> {
    const dayStart = zonedDateTimeToUtc(`${planDate}T00:00:00`, timeZone);
    const dayEnd = zonedDateTimeToUtc(`${addDays(planDate, 1)}T00:00:00`, timeZone);
    const settings = await this.sql<{ planning_buffer_minutes: number; planning_policy: unknown; week_starts_on: number }[]>`
      select planning_buffer_minutes,planning_policy,week_starts_on from public.user_settings where user_id=${userId}
    `;
    const setting = settings[0] ?? { planning_buffer_minutes: 0, planning_policy: {}, week_starts_on: 1 };
    const week = weekRange(planDate, setting.week_starts_on);
    const [taskRows, constraintRows, activityRows, directiveRows] = await Promise.all([
      this.sql<Record<string, unknown>[]>`select * from public.tasks where user_id=${userId} and status<>'DONE' order by created_at`,
      this.sql<{ id: string; constraint_type: string; value: unknown; hardness: string; valid_from: Date; valid_until: Date | null; origin: string }[]>`
        select id,constraint_type,value,hardness,valid_from,valid_until,origin from public.constraints
        where user_id=${userId} and valid_from<${dayEnd} and (valid_until is null or valid_until>${dayStart})
      `,
      this.sql<{ id: string; title: string; target_count: number; expected_minutes: number; minimum_minutes: number | null; preferred_days: number[] | null; importance: number; completed_count: number; occurrence_id: string | null }[]>`
        select a.id,a.title,a.target_count,a.expected_minutes,a.minimum_minutes,a.preferred_days,a.importance,
          count(o.id) filter(where o.status='completed' and o.counts_toward_target)::int completed_count,
          min(o.id::text) filter(where o.planned_date=${planDate} and o.status not in ('cancelled','skipped')) occurrence_id
        from public.recurring_activities a left join public.activity_occurrences o
          on o.recurring_activity_id=a.id and o.user_id=a.user_id and o.planned_date between ${week.start} and ${week.end}
        where a.user_id=${userId} and a.active=true and a.effective_from<=${planDate}
          and (a.effective_until is null or a.effective_until>=${planDate})
        group by a.id order by a.created_at
      `,
      this.sql<{ id: string; directive: string; priority_order: unknown }[]>`
        select id,directive,priority_order from public.strategic_directives
        where user_id=${userId} and valid_from<=${dayEnd} and (valid_until is null or valid_until>${dayStart})
          and confirmation_status in ('confirmed','approved','active') order by created_at
      `
    ]);
    const constraints: MorningConstraint[] = constraintRows.map((row) => {
      const value = asRecord(row.value);
      return {
        id: row.id, constraintType: row.constraint_type, hardness: row.hardness, origin: row.origin,
        title: typeof value.title === "string" ? value.title : null,
        blocksCapacity: value.blocksCapacity === true,
        start: row.valid_from, end: row.valid_until ?? dayEnd
      };
    });
    return {
      timeZone,
      planningBufferMinutes: setting.planning_buffer_minutes,
      planningPolicy: asRecord(setting.planning_policy),
      constraints,
      tasks: taskRows.map(mapTask),
      recurringActivities: activityRows.map((row) => ({
        id: row.id, title: row.title, targetCount: row.target_count,
        expectedMinutes: row.expected_minutes, minimumMinutes: row.minimum_minutes,
        preferredDays: row.preferred_days, importance: row.importance,
        completedCount: row.completed_count, occurrenceId: row.occurrence_id
      })),
      strategicDirectives: directiveRows.map((row) => ({ id: row.id, directive: row.directive, priorityOrder: row.priority_order }))
    };
  }

  async updateCheckpoint(
    run: MorningWorkflowRun,
    checkpoint: MorningCheckpoint,
    step: MorningStep,
    status: MorningWorkflowRun["status"],
    now: Date,
    messageId: string
  ): Promise<MorningWorkflowRun> {
    const rows = await this.sql<WorkflowRow[]>`
      update public.workflow_runs set checkpoint_state=${this.sql.json(checkpointJson({ ...checkpoint, lastMessageId: messageId }))},
        checkpoint_version=checkpoint_version+1,current_step=${step},status=${status},updated_at=${now}
      where id=${run.id} and user_id=${run.userId} and checkpoint_version=${run.checkpointVersion}
      returning *
    `;
    if (rows[0]) return mapWorkflow(rows[0]);
    const current = await this.findTodayWorkflow(run.userId, run.checkpoint.planDate);
    if (!current) throw new Error("Morning workflow disappeared");
    return current;
  }

  async createProposal(run: MorningWorkflowRun, draft: MorningPlanDraft, now: Date, messageId: string): Promise<MorningPlan> {
    return this.sql.begin(async (tx) => {
      const locked = await tx<WorkflowRow[]>`select * from public.workflow_runs where id=${run.id} and user_id=${run.userId} for update`;
      const current = mapWorkflow(locked[0]!);
      if (current.currentStep === "awaiting_approval") {
        const existing = await this.getPlan(tx, run.userId, current.checkpoint.planId ?? null);
        if (existing) return existing;
      }
      const previousRows = await tx<{ id: string; revision_no: number }[]>`
        select id,revision_no from public.daily_plans where user_id=${run.userId} and plan_date=${run.checkpoint.planDate}
        order by revision_no desc limit 1 for update
      `;
      const previous = previousRows[0];
      if (previous) {
        await tx`update public.daily_plans set status='superseded' where id=${previous.id} and user_id=${run.userId} and status in ('draft','pending_approval')`;
        await tx`
          update public.approval_requests set status='cancelled',responded_at=${now},responded_by='system',
            response_payload=${tx.json({ reason: "superseded_by_revision" })}
          where user_id=${run.userId} and workflow_run_id=${run.id} and action_ref=${previous.id} and status='pending'
        `;
      }
      const revisionNo = (previous?.revision_no ?? 0) + 1;
      const snapshot = {
        ...draft.inputSnapshot,
        highlights: draft.highlights,
        fixedEvents: draft.fixedEvents.map((value) => ({
          id: value.id, title: value.title, start: value.start.toISOString(), end: value.end.toISOString(),
          origin: value.origin, constraintType: value.constraintType, hardness: value.hardness, blocksCapacity: value.blocksCapacity
        }))
      };
      const plans = await tx<PlanRow[]>`
        insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,supersedes_plan_id,input_snapshot,created_by)
        values(${run.userId},${run.checkpoint.planDate},${run.checkpoint.timeZone},${revisionNo},'pending_approval',${previous?.id ?? null},${tx.json(snapshot as JSONValue)},'morning_workflow') returning *
      `;
      const plan = plans[0]!;
      const settings = await tx<{ week_starts_on: number }[]>`select week_starts_on from public.user_settings where user_id=${run.userId}`;
      const period = weekRange(run.checkpoint.planDate, settings[0]?.week_starts_on ?? 1);
      const occurrenceIds = new Map<string, string>();
      let position = 0;
      for (const item of draft.items) {
        position += 1;
        let occurrenceId: string | null = null;
        if (item.itemType === "routine") {
          const activityId = item.recurringActivityId!;
          occurrenceId = occurrenceIds.get(activityId) ?? null;
          if (!occurrenceId) {
            const existing = await tx<{ id: string }[]>`
              select id from public.activity_occurrences where user_id=${run.userId} and recurring_activity_id=${activityId}
                and planned_date=${run.checkpoint.planDate} and status not in ('cancelled','skipped') order by sequence_no limit 1
            `;
            occurrenceId = existing[0]?.id ?? null;
          }
          if (!occurrenceId) {
            const created = await tx<{ id: string }[]>`
              insert into public.activity_occurrences(user_id,recurring_activity_id,period_key,sequence_no,planned_date,planned_start_at,status)
              select ${run.userId},${activityId},${period.periodKey},coalesce(max(sequence_no),0)+1,${run.checkpoint.planDate},${item.start},'planned'
              from public.activity_occurrences where recurring_activity_id=${activityId} and period_key=${period.periodKey}
              returning id
            `;
            occurrenceId = created[0]!.id;
          }
          occurrenceIds.set(activityId, occurrenceId);
        }
        await tx`
          insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,activity_occurrence_id,planned_start_at,planned_end_at,planned_minutes,status)
          values(${run.userId},${plan.id},${position},${item.itemType},${item.taskId ?? null},${occurrenceId},${item.start},${item.end},${item.plannedMinutes},'planned')
        `;
      }
      const nextVersion = current.checkpointVersion + 1;
      const nextCheckpoint = { ...current.checkpoint, planId: plan.id, lastMessageId: messageId };
      const hash = planHash(plan.id, draft);
      const proposalEventType = revisionNo === 1 ? "plan_created" : "plan_replanned";
      await tx`
        update public.workflow_runs set status='waiting_for_user',current_step='awaiting_approval',
          checkpoint_state=${tx.json(checkpointJson(nextCheckpoint))},checkpoint_version=${nextVersion},updated_at=${now}
        where id=${run.id} and user_id=${run.userId}
      `;
      await tx`
        insert into public.approval_requests(user_id,workflow_run_id,action_type,action_ref,action_hash,checkpoint_version,status,requested_at,resume_idempotency_key)
        values(${run.userId},${run.id},'approve_daily_plan',${plan.id},${hash},${nextVersion},'pending',${now},${`morning-approval:${run.id}:${revisionNo}`})
      `;
      await tx`
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
        values(${run.userId},${proposalEventType},'daily_plan',${plan.id},'system',${now},${run.correlationId},${run.id},${`morning-${proposalEventType}:${run.id}:${revisionNo}`},1,${tx.json({ revisionNo })})
        on conflict(user_id,idempotency_key) do nothing
      `;
      return this.getPlan(tx, run.userId, plan.id).then((value) => value!);
    });
  }

  async getProposal(run: MorningWorkflowRun): Promise<MorningPlan | null> {
    return this.getPlan(this.sql, run.userId, run.checkpoint.planId ?? null);
  }

  async approve(run: MorningWorkflowRun, now: Date, messageId: string): Promise<{ plan: MorningPlan; duplicate: boolean }> {
    return this.sql.begin(async (tx) => {
      const workflows = await tx<WorkflowRow[]>`select * from public.workflow_runs where id=${run.id} and user_id=${run.userId} for update`;
      const current = mapWorkflow(workflows[0]!);
      if (current.currentStep === "completed") {
        const existing = await this.getPlan(tx, run.userId, current.checkpoint.planId ?? null);
        if (!existing) throw new Error("Approved morning plan missing");
        return { plan: existing, duplicate: true };
      }
      const planId = current.checkpoint.planId;
      if (!planId || current.currentStep !== "awaiting_approval") throw new Error("Morning workflow is not awaiting approval");
      const approvals = await tx<{ id: string; action_hash: string; checkpoint_version: number; status: string }[]>`
        select id,action_hash,checkpoint_version,status from public.approval_requests
        where user_id=${run.userId} and workflow_run_id=${run.id} and action_ref=${planId} order by created_at desc limit 1 for update
      `;
      const approval = approvals[0];
      if (!approval) throw new Error("Approval request missing");
      const updated = await tx<{ id: string }[]>`
        update public.approval_requests set status='approved',responded_at=${now},responded_by='user',
          response_payload=${tx.json({ messageId })}
        where id=${approval.id} and user_id=${run.userId} and status='pending' returning id
      `;
      if (updated.length === 0 && approval.status !== "approved") throw new Error("Approval request is no longer pending");
      const resumable = await tx<{ approval_is_resumable: boolean }[]>`
        select public.approval_is_resumable(${approval.id},${approval.action_hash},${approval.checkpoint_version})
      `;
      if (!resumable[0]?.approval_is_resumable) throw new Error("Approval precondition is stale");
      await tx`update public.daily_plans set status='superseded' where user_id=${run.userId} and plan_date=${current.checkpoint.planDate} and status='approved' and id<>${planId}`;
      const plans = await tx<PlanRow[]>`
        update public.daily_plans set status='approved',approval_source='discord',approval_reason='user_approved',approved_at=${now}
        where id=${planId} and user_id=${run.userId} and status='pending_approval' returning *
      `;
      if (!plans[0]) throw new Error("Proposed plan is stale");
      await tx`
        update public.workflow_runs set status='completed',current_step='completed',checkpoint_version=checkpoint_version+1,
          checkpoint_state=${tx.json(checkpointJson({ ...current.checkpoint, lastMessageId: messageId }))},
          updated_at=${now},completed_at=${now} where id=${run.id} and user_id=${run.userId}
      `;
      await tx`
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
        values(${run.userId},'plan_approved','daily_plan',${planId},'user',${now},${run.correlationId},${run.id},${`morning-plan-approved:${planId}`},1,${tx.json({ source: "discord" })})
        on conflict(user_id,idempotency_key) do nothing
      `;
      return { plan: (await this.getPlan(tx, run.userId, planId))!, duplicate: false };
    });
  }

  async deriveCurrentAction(userId: UserId, planDate: string): Promise<CurrentAction | null> {
    const focus = await this.sql<{ title: string }[]>`
      select t.title from public.focus_sessions f join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
      where f.user_id=${userId} and f.status='active' order by f.started_at desc limit 1
    `;
    if (focus[0]) return { title: focus[0].title, source: "focus_session" };
    const items = await this.sql<{ title: string }[]>`
      select coalesce(t.title,a.title) title from public.daily_plans p
      join public.plan_items i on i.daily_plan_id=p.id and i.user_id=p.user_id
      left join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
      left join public.activity_occurrences o on o.id=i.activity_occurrence_id and o.user_id=i.user_id
      left join public.recurring_activities a on a.id=o.recurring_activity_id and a.user_id=o.user_id
      where p.user_id=${userId} and p.plan_date=${planDate} and p.status='approved'
        and i.item_type in ('task','routine') and i.status not in ('completed','skipped','cancelled')
        and (t.id is null or t.status<>'DONE') and (o.id is null or o.status not in ('completed','skipped','cancelled'))
      order by i.position limit 1
    `;
    return items[0] ? { title: items[0].title, source: "plan_item" } : null;
  }

  private async getPlan(sql: Sql, userId: UserId, planId: string | null): Promise<MorningPlan | null> {
    if (!planId) return null;
    const plans = await sql<PlanRow[]>`select id,revision_no,status,input_snapshot from public.daily_plans where id=${planId} and user_id=${userId}`;
    const plan = plans[0];
    if (!plan) return null;
    const rows = await sql<PlanItemRow[]>`
      select i.item_type,i.task_id,o.recurring_activity_id,i.planned_start_at,i.planned_end_at,i.planned_minutes,
        coalesce(t.title,a.title,case when i.item_type='buffer' then '버퍼' else '휴식' end) title
      from public.plan_items i left join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
      left join public.activity_occurrences o on o.id=i.activity_occurrence_id and o.user_id=i.user_id
      left join public.recurring_activities a on a.id=o.recurring_activity_id and a.user_id=o.user_id
      where i.user_id=${userId} and i.daily_plan_id=${planId} order by i.position
    `;
    const snapshot = asRecord(plan.input_snapshot);
    const fixedEvents: MorningConstraint[] = Array.isArray(snapshot.fixedEvents) ? snapshot.fixedEvents.flatMap((entry) => {
      const value = asRecord(entry); const start = new Date(String(value.start)); const end = new Date(String(value.end));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
      return [{
        id: String(value.id), title: typeof value.title === "string" ? value.title : null,
        start, end, origin: String(value.origin), constraintType: String(value.constraintType),
        hardness: String(value.hardness), blocksCapacity: value.blocksCapacity === true
      }];
    }) : [];
    const items: MorningPlanItemDraft[] = rows.map((row) => ({
      itemType: row.item_type, title: row.title ?? "계획 항목", plannedMinutes: row.planned_minutes,
      start: row.planned_start_at, end: row.planned_end_at,
      ...(row.task_id ? { taskId: row.task_id } : {}),
      ...(row.recurring_activity_id ? { recurringActivityId: row.recurring_activity_id } : {})
    }));
    return {
      id: plan.id, revisionNo: plan.revision_no, status: plan.status as MorningPlan["status"], items, fixedEvents,
      highlights: Array.isArray(snapshot.highlights) ? snapshot.highlights.filter((value): value is string => typeof value === "string") : []
    };
  }
}
