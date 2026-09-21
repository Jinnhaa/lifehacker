import { randomUUID } from "node:crypto";
import { DomainError, FixedClock, type TaskId, type UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import { TaskService } from "./task-service.js";
import { SupabaseTaskRepository } from "./supabase-task-repository.js";

export type OfficialSubmissionEvidence = {
  readonly state: "not_linked" | "confirmed" | "pending_confirmation";
  readonly sources: readonly string[];
  readonly statuses: readonly string[];
};

export type ManualQuestCompletionResult = {
  readonly kind: "step" | "task";
  readonly duplicate: boolean;
  readonly officialSubmission: OfficialSubmissionEvidence;
};

export type ManualRoutineCompletionResult = { readonly duplicate: boolean };

const confirmedSubmissionStatuses = new Set(["submitted", "late", "not_required"]);

const officialSubmissionEvidence = async (
  sql: Sql,
  userId: UserId,
  taskId: TaskId
): Promise<OfficialSubmissionEvidence> => {
  const [references, assessments] = await Promise.all([
    sql<{ source: string }[]>`
      select distinct source from public.external_references
      where user_id=${userId} and internal_entity_type='task' and internal_entity_id=${taskId}
        and ownership='external' and sync_status='active'
      order by source`,
    sql<{ submission_status: string | null }[]>`
      select submission_status from public.course_assessments
      where user_id=${userId} and linked_task_id=${taskId}
      order by observed_at desc`
  ]);
  const sources = [...new Set(references.map((reference) => reference.source))];
  const statuses = [...new Set(assessments.flatMap((assessment) => assessment.submission_status
    ? [assessment.submission_status.toLowerCase()]
    : []))];
  if (sources.length === 0 && assessments.length === 0) return { state: "not_linked", sources, statuses };
  return {
    state: statuses.length > 0 && statuses.every((status) => confirmedSubmissionStatuses.has(status))
      ? "confirmed"
      : "pending_confirmation",
    sources,
    statuses
  };
};

const appendCompletionEvidence = async (
  sql: Sql,
  input: {
    readonly userId: UserId;
    readonly taskId: TaskId;
    readonly stepId?: string;
    readonly now: Date;
    readonly officialSubmission: OfficialSubmissionEvidence;
  }
): Promise<void> => {
  await sql`
    insert into public.domain_events(
      user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,
      correlation_id,idempotency_key,payload_version,payload
    ) values(
      ${input.userId},'manual_completion_recorded','task',${input.taskId},'manual',${input.now},
      ${randomUUID()},${`manual-completion-evidence:${input.taskId}`},1,${sql.json({
        source: "manual",
        authority: "user",
        effect: "current_status_completed",
        step_id: input.stepId ?? null,
        official_submission: input.officialSubmission
      } as unknown as JSONValue)}
    ) on conflict(user_id,idempotency_key) do nothing`;
};

const completeParentTask = async (
  sql: Sql,
  userId: UserId,
  taskId: TaskId,
  now: Date,
  stepId?: string
): Promise<ManualQuestCompletionResult> => {
  const repository = new SupabaseTaskRepository(sql);
  const current = await repository.getTaskById(userId, taskId);
  if (!current) throw new DomainError("INVALID_INPUT", "할 일을 찾지 못했습니다.");
  const officialSubmission = await officialSubmissionEvidence(sql, userId, taskId);
  if (current.status === "DONE") return { kind: "task", duplicate: true, officialSubmission };

  const service = new TaskService(repository, new FixedClock(now));
  if (current.status === "INBOX") await service.planTask({ userId, taskId, source: "manual" });
  await service.completeTask({ userId, taskId, source: "manual" });
  await sql`update public.tasks set completion_source='manual' where id=${taskId} and user_id=${userId}`;
  await appendCompletionEvidence(sql, { userId, taskId, ...(stepId && { stepId }), now, officialSubmission });

  const items = await sql<{ id: string; planned_minutes: number }[]>`
    update public.plan_items i set status='completed',updated_at=${now}
    from public.daily_plans p where i.daily_plan_id=p.id and i.user_id=${userId} and i.task_id=${taskId}
      and p.user_id=${userId} and p.status='approved'
      and p.plan_date=(now() at time zone (select timezone from public.profiles where id=${userId}))::date
      and i.status not in ('completed','cancelled') returning i.id,i.planned_minutes`;
  if (items.length) {
    await sql`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'replan_triggered','plan_item',${items[0]!.id},'manual',${now},${randomUUID()},${`manual-complete-replan:${taskId}`},1,
        ${sql.json({ reason: "task_completed_early", delta_minutes: -items.reduce((sum, item) => sum + item.planned_minutes, 0), replan_executed: false, source: "manual" })})
      on conflict(user_id,idempotency_key) do nothing`;
  }
  return { kind: "task", duplicate: false, officialSubmission };
};

/** Records authoritative user completion without inventing Focus duration or changing official source facts. */
export async function completeManualQuest(
  sql: Sql,
  userId: UserId,
  taskId: TaskId,
  stepId?: string
): Promise<ManualQuestCompletionResult> {
  return sql.begin(async (tx) => {
    const active = await tx<{ id: string }[]>`
      select id from public.focus_sessions
      where user_id=${userId} and task_id=${taskId} and status='active' limit 1 for update`;
    if (active.length) throw new DomainError("CONFLICT", "진행 중인 Focus는 Focus 화면에서 완료해 주세요.");
    const tasks = await tx<{ status: string }[]>`
      select status from public.tasks where id=${taskId} and user_id=${userId} for update`;
    if (!tasks[0]) throw new DomainError("INVALID_INPUT", "할 일을 찾지 못했습니다.");

    if (tasks[0].status === "DONE") return completeParentTask(tx, userId, taskId, new Date(), stepId);

    if (stepId) {
      const steps = await tx<{ id: string; position: number; status: string }[]>`
        select id,position,status from public.task_steps
        where id=${stepId} and task_id=${taskId} and user_id=${userId} for update`;
      const step = steps[0];
      if (!step) throw new DomainError("INVALID_INPUT", "완료할 Step을 찾지 못했습니다.");
      if (step.status === "completed") {
        const officialSubmission = await officialSubmissionEvidence(tx, userId, taskId);
        return { kind: "step", duplicate: true, officialSubmission };
      }
      const now = new Date();
      await tx`update public.task_steps set status='completed',updated_at=${now}
        where id=${stepId} and task_id=${taskId} and user_id=${userId}`;
      await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
        values(${userId},'task_step_completed','task_step',${stepId},'manual',${now},${randomUUID()},${`manual-step:${stepId}`},1,
          ${tx.json({ task_id: taskId, position: step.position, source: "manual", authority: "user" })})
        on conflict(user_id,idempotency_key) do nothing`;
      const remaining = await tx<{ id: string }[]>`
        select id from public.task_steps
        where user_id=${userId} and task_id=${taskId} and status<>'completed' limit 1`;
      if (remaining.length) {
        const officialSubmission = await officialSubmissionEvidence(tx, userId, taskId);
        return { kind: "step", duplicate: false, officialSubmission };
      }
      return completeParentTask(tx, userId, taskId, now, stepId);
    }

    const remaining = await tx<{ id: string }[]>`
      select id from public.task_steps
      where user_id=${userId} and task_id=${taskId} and status<>'completed' limit 1`;
    if (remaining.length) throw new DomainError("INVALID_INPUT", "남은 Step을 먼저 완료해 주세요.");
    return completeParentTask(tx, userId, taskId, new Date());
  });
}

/** Uses the existing ActivityOccurrence completion state for a planned routine. */
export async function completeManualRoutine(
  sql: Sql,
  userId: UserId,
  occurrenceId: string
): Promise<ManualRoutineCompletionResult> {
  return sql.begin(async (tx) => {
    const active = await tx<{ id: string }[]>`
      select id from public.focus_sessions
      where user_id=${userId} and activity_occurrence_id=${occurrenceId} and status='active' limit 1 for update`;
    if (active.length) throw new DomainError("CONFLICT", "진행 중인 Focus는 Focus 화면에서 완료해 주세요.");
    const now = new Date();
    const occurrences = await tx<{ id: string; status: string }[]>`
      select o.id,o.status from public.activity_occurrences o
      join public.plan_items i on i.activity_occurrence_id=o.id and i.user_id=o.user_id
      join public.daily_plans p on p.id=i.daily_plan_id and p.user_id=i.user_id
      where o.id=${occurrenceId} and o.user_id=${userId} and p.status='approved'
        and p.plan_date=(now() at time zone (select timezone from public.profiles where id=${userId}))::date
      limit 1 for update of o`;
    if (!occurrences[0]) throw new DomainError("INVALID_INPUT", "완료할 루틴을 찾지 못했습니다.");
    if (occurrences[0].status === "completed") return { duplicate: true };
    if (!["planned", "in_progress", "partial"].includes(occurrences[0].status)) {
      throw new DomainError("INVALID_INPUT", "완료할 루틴을 찾지 못했습니다.");
    }
    await tx`update public.activity_occurrences set status='completed',ended_at=${now}
      where id=${occurrenceId} and user_id=${userId}`;
    const items = await tx<{ id: string; planned_minutes: number }[]>`
      update public.plan_items i set status='completed',updated_at=${now}
      from public.daily_plans p where i.daily_plan_id=p.id and i.user_id=${userId} and i.activity_occurrence_id=${occurrenceId}
        and p.user_id=${userId} and p.status='approved'
        and p.plan_date=(now() at time zone (select timezone from public.profiles where id=${userId}))::date
        and i.status not in ('completed','cancelled')
      returning i.id,i.planned_minutes`;
    await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'activity_occurrence_completed','activity_occurrence',${occurrenceId},'manual',${now},${randomUUID()},${`manual-routine:${occurrenceId}`},1,
        ${tx.json({ source: "manual", authority: "user", actual_minutes: null })})
      on conflict(user_id,idempotency_key) do nothing`;
    if (items.length) await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'replan_triggered','plan_item',${items[0]!.id},'manual',${now},${randomUUID()},${`manual-routine-replan:${occurrenceId}`},1,
        ${tx.json({ reason: "task_completed_early", delta_minutes: -items.reduce((sum, item) => sum + item.planned_minutes, 0), replan_executed: false, source: "manual" })})
      on conflict(user_id,idempotency_key) do nothing`;
    return { duplicate: false };
  });
}
