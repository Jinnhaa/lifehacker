import { randomUUID } from "node:crypto";
import { DomainError, SystemClock, type TaskId, type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { TaskService } from "./task-service.js";
import { SupabaseTaskRepository } from "./supabase-task-repository.js";

/** Completes an externally finished quest without inventing Focus time. */
export async function completeManualQuest(sql: Sql, userId: UserId, taskId: TaskId, stepId?: string): Promise<"step" | "task"> {
  const active = await sql<{ id: string }[]>`select id from public.focus_sessions where user_id=${userId} and task_id=${taskId} and status='active' limit 1`;
  if (active.length) throw new DomainError("CONFLICT", "진행 중인 Focus는 Focus 화면에서 완료해 주세요.");
  if (stepId) {
    const now = new Date();
    const updated = await sql<{ id: string; position: number }[]>`
      update public.task_steps set status='completed',updated_at=${now}
      where id=${stepId} and task_id=${taskId} and user_id=${userId} and status<>'completed'
      returning id,position`;
    if (!updated[0]) throw new DomainError("INVALID_INPUT", "완료할 Step을 찾지 못했습니다.");
    await sql`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'task_step_completed','task_step',${stepId},'manual',${now},${randomUUID()},${`manual-step:${stepId}`},1,
        ${sql.json({ task_id: taskId, position: updated[0].position, source: "manual" })}) on conflict(user_id,idempotency_key) do nothing`;
    return "step";
  }
  const steps = await sql<{ id: string }[]>`select id from public.task_steps where user_id=${userId} and task_id=${taskId} and status<>'completed' limit 1`;
  if (steps.length) throw new DomainError("INVALID_INPUT", "남은 Step을 먼저 완료해 주세요.");
  const repository = new SupabaseTaskRepository(sql);
  const current = await repository.getTaskById(userId, taskId);
  if (!current) throw new DomainError("INVALID_INPUT", "할 일을 찾지 못했습니다.");
  if (current.status !== "DONE") {
    const service = new TaskService(repository, new SystemClock());
    if (current.status === "INBOX") await service.planTask({ userId, taskId, source: "manual" });
    await service.completeTask({ userId, taskId, source: "manual" });
  }
  const now = new Date();
  const items = await sql<{ id: string; planned_minutes: number }[]>`
    update public.plan_items i set status='completed',updated_at=${now}
    from public.daily_plans p where i.daily_plan_id=p.id and i.user_id=${userId} and i.task_id=${taskId}
      and p.user_id=${userId} and p.status='approved' and p.plan_date=(now() at time zone (select timezone from public.profiles where id=${userId}))::date
      and i.status not in ('completed','cancelled') returning i.id,i.planned_minutes`;
  if (items.length) {
    await sql`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'replan_triggered','plan_item',${items[0]!.id},'manual',${now},${randomUUID()},${`manual-complete-replan:${taskId}`},1,
        ${sql.json({ reason: "task_completed_early", delta_minutes: -items.reduce((sum, item) => sum + item.planned_minutes, 0), replan_executed: false, source: "manual" })})
      on conflict(user_id,idempotency_key) do nothing`;
  }
  return "task";
}

/** Uses the existing ActivityOccurrence completion state for a planned routine. */
export async function completeManualRoutine(sql: Sql, userId: UserId, occurrenceId: string): Promise<void> {
  await sql.begin(async (tx) => {
    const now = new Date();
    const occurrences = await tx<{ id: string }[]>`
      update public.activity_occurrences o set status='completed',ended_at=${now}
      from public.plan_items i join public.daily_plans p on p.id=i.daily_plan_id and p.user_id=i.user_id
      where o.id=${occurrenceId} and o.user_id=${userId} and o.status in ('planned','in_progress','partial')
        and i.activity_occurrence_id=o.id and i.user_id=${userId} and p.status='approved'
        and p.plan_date=(now() at time zone (select timezone from public.profiles where id=${userId}))::date
      returning o.id`;
    if (!occurrences[0]) throw new DomainError("INVALID_INPUT", "완료할 루틴을 찾지 못했습니다.");
    const items = await tx<{ id: string; planned_minutes: number }[]>`
      update public.plan_items i set status='completed',updated_at=${now}
      from public.daily_plans p where i.daily_plan_id=p.id and i.user_id=${userId} and i.activity_occurrence_id=${occurrenceId}
        and p.user_id=${userId} and p.status='approved'
        and p.plan_date=(now() at time zone (select timezone from public.profiles where id=${userId}))::date
        and i.status not in ('completed','cancelled')
      returning i.id,i.planned_minutes`;
    await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'activity_occurrence_completed','activity_occurrence',${occurrenceId},'manual',${now},${randomUUID()},${`manual-routine:${occurrenceId}`},1,
        ${tx.json({ source: "manual", actual_minutes: null })}) on conflict(user_id,idempotency_key) do nothing`;
    if (items.length) await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${userId},'replan_triggered','plan_item',${items[0]!.id},'manual',${now},${randomUUID()},${`manual-routine-replan:${occurrenceId}`},1,
        ${tx.json({ reason: "task_completed_early", delta_minutes: -items.reduce((sum, item) => sum + item.planned_minutes, 0), replan_executed: false, source: "manual" })})
      on conflict(user_id,idempotency_key) do nothing`;
  });
}
