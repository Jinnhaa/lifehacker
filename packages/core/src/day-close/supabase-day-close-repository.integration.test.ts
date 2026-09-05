import { randomUUID } from "node:crypto";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseMorningRepository } from "../morning/supabase-morning-repository.js";
import { DayCloseService } from "./day-close-service.js";
import { SupabaseDayCloseRepository } from "./supabase-day-close-repository.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const user = randomUUID() as UserId;
const noPlanUser = randomUUID() as UserId;
const otherUser = randomUUID() as UserId;
const planId = randomUUID();
const doneTask = randomUUID();
const activeTask = randomUUID();
const blockedTask = randomUUID();
const noPlanTask = randomUUID();
const activityId = randomUUID();
const occurrenceId = randomUUID();
const activeSession = randomUUID();
const now = new Date("2026-09-04T14:00:00.000Z");
const clock = new FixedClock(now);
const repository = new SupabaseDayCloseRepository(sql);
const service = new DayCloseService({ repository, clock });

beforeAll(async () => {
  await sql`
    insert into auth.users(id,email,created_at,updated_at) values
      (${user},${`day-close-${user}@example.test`},now(),now()),
      (${noPlanUser},${`day-close-${noPlanUser}@example.test`},now(),now()),
      (${otherUser},${`day-close-${otherUser}@example.test`},now(),now())
  `;
  await sql`insert into public.profiles(id,timezone) values (${user},'Asia/Seoul'),(${noPlanUser},'Asia/Seoul'),(${otherUser},'Asia/Seoul')`;
  await sql`insert into public.user_settings(user_id,planning_buffer_minutes,week_starts_on) values (${user},15,1),(${noPlanUser},0,1),(${otherUser},0,1)`;
  await sql`
    insert into public.tasks(id,user_id,title,execution_mode,estimated_minutes,actual_minutes,importance,status,completed_at)
    values
      (${doneTask},${user},'완료 과제','standard',30,40,4,'DONE',${new Date("2026-09-04T12:00:00.000Z")}),
      (${activeTask},${user},'진행 중 과제','standard',60,0,5,'IN_PROGRESS',null),
      (${blockedTask},${user},'막힌 과제','standard',45,0,3,'BLOCKED',null),
      (${noPlanTask},${noPlanUser},'계획 없는 날 완료','standard',15,15,3,'DONE',${new Date("2026-09-04T10:00:00.000Z")})
  `;
  await sql`
    insert into public.recurring_activities(id,user_id,title,category,period,target_count,expected_minutes,scheduling_mode,importance,effective_from,active)
    values(${activityId},${user},'일본어','study','week',2,20,'flexible',4,'2026-09-01',true)
  `;
  await sql`
    insert into public.activity_occurrences(id,user_id,recurring_activity_id,period_key,sequence_no,planned_date,status)
    values(${occurrenceId},${user},${activityId},'2026-08-31',1,'2026-09-04','planned')
  `;
  await sql`
    insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by)
    values(${planId},${user},'2026-09-04','Asia/Seoul',1,'draft','{}','test')
  `;
  await sql`
    insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,activity_occurrence_id,planned_minutes,status)
    values
      (${user},${planId},1,'task',${doneTask},null,30,'completed'),
      (${user},${planId},2,'task',${activeTask},null,60,'in_progress'),
      (${user},${planId},3,'task',${blockedTask},null,45,'blocked'),
      (${user},${planId},4,'routine',null,${occurrenceId},20,'planned')
  `;
  await sql`update public.daily_plans set status='approved',approved_at=${new Date("2026-09-04T00:00:00.000Z")} where id=${planId}`;
  await sql`
    insert into public.focus_sessions(user_id,task_id,status,started_at,ended_at,end_reason,actual_minutes)
    values
      (${user},${doneTask},'completed',${new Date("2026-09-04T11:20:00.000Z")},${new Date("2026-09-04T12:00:00.000Z")},'task_completed',40),
      (${noPlanUser},${noPlanTask},'completed',${new Date("2026-09-04T09:45:00.000Z")},${new Date("2026-09-04T10:00:00.000Z")},'task_completed',15)
  `;
  const activeItem = await sql<{ id: string }[]>`select id from public.plan_items where daily_plan_id=${planId} and task_id=${activeTask}`;
  await sql`
    insert into public.focus_sessions(id,user_id,task_id,plan_item_id,status,started_at,actual_minutes)
    values(${activeSession},${user},${activeTask},${activeItem[0]!.id},'active',${new Date("2026-09-04T13:30:00.000Z")},0)
  `;
  await sql`
    insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
    values
      (${user},'plan_replanned','daily_plan',${planId},'system',${new Date("2026-09-04T09:00:00.000Z")},gen_random_uuid(),'day-close-replan',1,'{}'),
      (${user},'task_blocked','task',${blockedTask},'user',${new Date("2026-09-04T10:00:00.000Z")},gen_random_uuid(),'day-close-blocked',1,'{}')
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${user},${noPlanUser},${otherUser})`;
  await sql.end();
});

const message = (userId: UserId, text: string, id: string) => ({
  userId, timeZone: "Asia/Seoul", text, messageId: `discord:${id}`, receivedAt: now
});

describe("Supabase Day Close", () => {
  it("guards active Focus, closes once, aggregates facts, and exposes carryover to next Morning", async () => {
    const guardrail = await service.handleDayCloseMessage(message(user, "오늘 끝", "close"));
    const repeatedGuardrail = await service.handleDayCloseMessage(message(user, "오늘 끝", "close"));
    expect(guardrail.reply).toContain("진행 중인 작업");
    expect(repeatedGuardrail.reply).toBe(guardrail.reply);
    const before = await sql<{ status: string; task_status: string }[]>`
      select f.status,t.status task_status from public.focus_sessions f join public.tasks t on t.id=f.task_id where f.id=${activeSession}
    `;
    expect(before[0]).toEqual({ status: "active", task_status: "IN_PROGRESS" });

    const summary = await service.handleDayCloseMessage(message(user, "응", "confirm"));
    expect(summary.reply).toContain("완료 1개 · 미완료 3개");
    expect(summary.reply).toContain("집중 1시간 10분 / 계획 2시간 35분");
    expect(summary.reply).toContain("일정 조정 1회");
    expect(summary.reply).toContain("진행 중 과제");
    expect(summary.reply).toContain("막힌 과제");
    expect(summary.reply).toContain("일본어");

    const stored = await sql<{
      workflow_count: number; event_count: number; focus_status: string; end_reason: string;
      focus_minutes: number; task_status: string; task_minutes: number; plan_status: string;
      result: { plannedMinutes: number; actualMinutes: number; replanCount: number; carryoverTaskIds: string[]; blockedTaskIds: string[] };
    }[]>`
      select
        (select count(*)::int from public.workflow_runs where user_id=${user} and workflow_type='day_close') workflow_count,
        (select count(*)::int from public.domain_events where user_id=${user} and event_type='day_closed') event_count,
        f.status focus_status,f.end_reason,f.actual_minutes focus_minutes,t.status task_status,t.actual_minutes task_minutes,
        p.status plan_status,w.checkpoint_state->'result' result
      from public.focus_sessions f join public.tasks t on t.id=f.task_id
      join public.daily_plans p on p.id=${planId}
      join public.workflow_runs w on w.user_id=${user} and w.workflow_type='day_close'
      where f.id=${activeSession}
    `;
    expect(stored[0]).toMatchObject({
      workflow_count: 1, event_count: 1, focus_status: "cancelled", end_reason: "day_close",
      focus_minutes: 30, task_status: "IN_PROGRESS", task_minutes: 30, plan_status: "closed"
    });
    expect(stored[0]?.result).toMatchObject({
      plannedMinutes: 155, actualMinutes: 70, replanCount: 1,
      carryoverTaskIds: expect.arrayContaining([activeTask, blockedTask]),
      blockedTaskIds: [blockedTask]
    });

    const duplicate = await service.handleDayCloseMessage(message(user, "잘게", "retry"));
    expect(duplicate.reply).toBe(summary.reply);
    const afterRetry = await sql<{ events: number; task_minutes: number }[]>`
      select
        (select count(*)::int from public.domain_events where user_id=${user} and event_type='day_closed') events,
        (select actual_minutes from public.tasks where id=${activeTask}) task_minutes
    `;
    expect(afterRetry[0]).toEqual({ events: 1, task_minutes: 30 });

    const morning = await new SupabaseMorningRepository(sql).loadObservation(user, "2026-09-05", "Asia/Seoul");
    expect(morning.carryoverContext).toEqual({
      sourceDate: "2026-09-04",
      taskIds: expect.arrayContaining([activeTask, blockedTask]),
      blockedTaskIds: [blockedTask]
    });
    expect(await repository.findWorkflow(otherUser, "2026-09-04")).toBeNull();
  });

  it("closes a no-plan day from execution facts", async () => {
    const summary = await service.handleDayCloseMessage(message(noPlanUser, "이제 잘게", "no-plan"));
    expect(summary.reply).toContain("계획 0분");
    const rows = await sql<{ aggregate_type: string; result: { plannedMinutes: number; actualMinutes: number; completedTaskIds: string[] } }[]>`
      select e.aggregate_type,w.checkpoint_state->'result' result from public.domain_events e
      join public.workflow_runs w on w.id=e.workflow_run_id and w.user_id=e.user_id
      where e.user_id=${noPlanUser} and e.event_type='day_closed'
    `;
    expect(rows[0]).toEqual({
      aggregate_type: "workflow_run",
      result: { ...rows[0]!.result, plannedMinutes: 0, actualMinutes: 15, completedTaskIds: [noPlanTask] }
    });
  });
});
