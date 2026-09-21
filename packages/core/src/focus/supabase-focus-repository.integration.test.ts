import { randomUUID } from "node:crypto";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FocusWorkflowService } from "./focus-service.js";
import { SupabaseFocusRepository } from "./supabase-focus-repository.js";
import { completeManualRoutine } from "../task/manual-quest-completion.js";
import { deriveCurrentAction } from "../execution/current-action.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userA = randomUUID() as UserId;
const userB = randomUUID() as UserId;
const planId = randomUUID();
const taskIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
const planItemIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
const clock = new FixedClock(new Date("2026-09-04T00:00:00.000Z"));
const repository = new SupabaseFocusRepository(sql);
const service = new FocusWorkflowService({ repository, clock });

beforeAll(async () => {
  await sql`
    insert into auth.users(id,email,created_at,updated_at) values
      (${userA},${`focus-${userA}@example.test`},now(),now()),
      (${userB},${`focus-${userB}@example.test`},now(),now())
  `;
  await sql`insert into public.profiles(id,timezone) values (${userA},'Asia/Seoul'),(${userB},'Asia/Seoul')`;
  await sql`
    insert into public.tasks(id,user_id,title,execution_mode,estimated_minutes,importance,status,completion_criteria,next_action)
    values
      (${taskIds[0]},${userA},'첫 번째 과제','standard',50,5,'PLANNED','두 Step 완료','첫 Step 시작'),
      (${taskIds[1]},${userA},'어려운 과제','standard',40,4,'PLANNED','초안 완성','어려운 Step 시작'),
      (${taskIds[2]},${userA},'자료 필요한 과제','standard',30,3,'PLANNED','자료 반영','자료 확인'),
      (${taskIds[3]},${userA},'다음 과제','standard',20,2,'PLANNED','한 항목 완료','바로 시작')
  `;
  await sql`
    insert into public.task_steps(user_id,task_id,position,title,owner,estimated_minutes,completion_criteria,status)
    values
      (${userA},${taskIds[0]},1,'자료 읽기','user',20,'핵심 표시','pending'),
      (${userA},${taskIds[0]},2,'답안 작성','user',30,'답안 완성','pending'),
      (${userA},${taskIds[1]},1,'어려운 Step','user',40,'초안 완성','pending'),
      (${userA},${taskIds[2]},1,'자료 반영','user',30,'자료 인용','pending')
  `;
  await sql`
    insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by,approved_at)
    values(${planId},${userA},'2026-09-04','Asia/Seoul',1,'pending_approval','{}','test',null)
  `;
  for (const [index, taskId] of taskIds.entries()) {
    const planItemId = planItemIds[index]!;
    await sql`
      insert into public.plan_items(id,user_id,daily_plan_id,position,item_type,task_id,planned_minutes,status)
      values(${planItemId},${userA},${planId},${index + 1},'task',${taskId},${index === 0 ? 50 : 30},'planned')
    `;
  }
  await sql`update public.daily_plans set status='approved',approved_at=now() where id=${planId} and user_id=${userA}`;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userA},${userB})`;
  await sql.end();
});

const message = (text: string, id: string, userId = userA) => ({
  userId, timeZone: "Asia/Seoul", text, messageId: `discord:${id}`,
  receivedAt: new Date("2026-09-04T00:00:00.000Z")
});

describe("Focus Workflow local Supabase", () => {
  it("focuses a 45-minute routine, stores exact actual time, then advances past manual completion", async () => {
    const routineUser = randomUUID() as UserId;
    const routineId = randomUUID();
    const occurrences = [randomUUID(), randomUUID()] as const;
    const routinePlan = randomUUID();
    const planDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const focusStart = new Date(`${planDate}T00:00:00+09:00`);
    const routineClock = new FixedClock(focusStart);
    const routineService = new FocusWorkflowService({ repository, clock: routineClock });
    const routineMessage = (text: string, key: string) => ({
      userId: routineUser, timeZone: "Asia/Seoul", text,
      messageId: `routine:${key}`, receivedAt: routineClock.now()
    });
    try {
      await sql`insert into auth.users(id,email,created_at,updated_at) values(${routineUser},${`focus-${routineUser}@example.test`},now(),now())`;
      await sql`insert into public.profiles(id,timezone) values(${routineUser},'Asia/Seoul')`;
      await sql`insert into public.recurring_activities(id,user_id,title,category,period,target_count,expected_minutes,scheduling_mode,importance,effective_from)
        values(${routineId},${routineUser},'독서','study','week',2,45,'flexible',3,'2026-01-01')`;
      await sql`insert into public.activity_occurrences(id,user_id,recurring_activity_id,period_key,sequence_no,planned_date,status)
        values(${occurrences[0]},${routineUser},${routineId},${routineUser},1,${planDate},'planned'),
          (${occurrences[1]},${routineUser},${routineId},${routineUser},2,${planDate},'planned')`;
      await sql`insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by,approved_at)
        values(${routinePlan},${routineUser},${planDate},'Asia/Seoul',1,'pending_approval','{}','test',null)`;
      await sql`insert into public.plan_items(user_id,daily_plan_id,position,item_type,activity_occurrence_id,planned_minutes,status)
        values(${routineUser},${routinePlan},1,'routine',${occurrences[0]},45,'planned'),
          (${routineUser},${routinePlan},2,'routine',${occurrences[1]},45,'planned')`;
      await sql`update public.daily_plans set status='approved',approved_at=now() where id=${routinePlan}`;

      const started = await routineService.handleFocusMessage(routineMessage("시작:45", "start"));
      expect(started.reply).toContain("독서");
      const active = await sql<{ id: string; started_at: Date; planned_minutes: number; actual_seconds: number }[]>`
        select id,started_at,planned_minutes,actual_seconds from public.focus_sessions
        where user_id=${routineUser} and activity_occurrence_id=${occurrences[0]} and status='active'`;
      expect(active[0]?.planned_minutes).toBe(45);
      expect(active[0]?.started_at.toISOString()).toBe(focusStart.toISOString());
      expect(active[0]?.actual_seconds).toBe(0);

      routineClock.set(new Date(focusStart.getTime() + 10 * 60_000));
      await routineService.handleFocusMessage(routineMessage("15분 더", "extend"));
      const extended = await sql<{ planned_minutes: number }[]>`
        select planned_minutes from public.focus_sessions where id=${active[0]!.id}`;
      expect(extended[0]?.planned_minutes).toBe(60);

      routineClock.set(new Date(focusStart.getTime() + 42 * 60_000 + 15_000));
      const completed = await routineService.handleFocusMessage(routineMessage("완료", "complete"));
      expect(completed.reply).toContain("다음 할 일은 독서");
      const finished = await sql<{ status: string; planned_minutes: number; actual_minutes: number; actual_seconds: number }[]>`
        select status,planned_minutes,actual_minutes,actual_seconds from public.focus_sessions where id=${active[0]!.id}`;
      expect(finished[0]).toEqual({ status: "completed", planned_minutes: 60, actual_minutes: 42, actual_seconds: 2535 });
      const next = await deriveCurrentAction(sql, routineUser, planDate, "Asia/Seoul", routineClock.now());
      expect(next?.kind).toBe("routine");
      if (next?.kind === "routine") expect(next.activityOccurrenceId).toBe(occurrences[1]);

      await completeManualRoutine(sql, routineUser, occurrences[1]!);
      const totals = await sql<{ sessions: number; actual_minutes: number | null; status: string }[]>`
        select (select count(*)::int from public.focus_sessions where user_id=${routineUser}) sessions,
          actual_minutes,status from public.activity_occurrences where id=${occurrences[1]}`;
      expect(totals[0]).toEqual({ sessions: 1, actual_minutes: null, status: "completed" });
      expect(await deriveCurrentAction(sql, routineUser, planDate, "Asia/Seoul", routineClock.now())).toBeNull();
    } finally {
      await sql`delete from auth.users where id=${routineUser}`;
    }
  });
  it("executes steps, records time, recovers, switches once confirmed, and isolates users", async () => {
    const started = await service.handleFocusMessage(message("시작", "start-1"));
    const duplicateStart = await service.handleFocusMessage(message("시작할게", "start-2"));
    expect(started.reply).toContain("첫 번째 과제");
    expect(started.reply).toContain("전체 흐름");
    expect(started.reply).toContain("두 Step 완료");
    expect(duplicateStart.reply).toContain("이미 집중 중");
    const initial = await sql<{ sessions: number; status: string }[]>`
      select (select count(*)::int from public.focus_sessions where user_id=${userA} and status='active') sessions,
        (select status from public.tasks where id=${taskIds[0]}) status
    `;
    expect(initial[0]).toEqual({ sessions: 1, status: "IN_PROGRESS" });

    clock.set(new Date("2026-09-04T00:20:00.000Z"));
    const stepCompleted = await service.handleFocusMessage(message("완료", "complete-step"));
    expect(stepCompleted.reply).toContain("답안 작성");
    const repeatedStepCompletion = await service.handleFocusMessage(message("완료", "complete-step"));
    expect(repeatedStepCompletion.reply).toBe("이미 처리했어.");
    const firstStep = await sql<{ status: string }[]>`
      select status from public.task_steps where task_id=${taskIds[0]} and position=1
    `;
    expect(firstStep[0]?.status).toBe("completed");

    clock.set(new Date("2026-09-04T00:50:00.000Z"));
    const taskCompleted = await service.handleFocusMessage(message("끝", "complete-task"));
    expect(taskCompleted.reply).toContain("다음 할 일은 어려운 과제");
    const completedState = await sql<{ status: string; actual_minutes: number; active: number }[]>`
      select t.status,t.actual_minutes,
        (select count(*)::int from public.focus_sessions where user_id=${userA} and status='active') active
      from public.tasks t where t.id=${taskIds[0]}
    `;
    expect(completedState[0]).toEqual({ status: "DONE", actual_minutes: 50, active: 0 });
    const taskFocus = await sql<{ planned_minutes: number; actual_seconds: number }[]>`
      select planned_minutes,actual_seconds from public.focus_sessions where user_id=${userA} and task_id=${taskIds[0]} order by started_at desc limit 1`;
    expect(taskFocus[0]).toEqual({ planned_minutes: 25, actual_seconds: 3_000 });

    clock.set(new Date("2026-09-04T01:00:00.000Z"));
    await service.handleFocusMessage(message("시작", "start-hard"));
    clock.set(new Date("2026-09-04T01:10:00.000Z"));
    const blockQuestion = await service.handleFocusMessage(message("막혔어", "block-hard"));
    expect(blockQuestion.reply).toContain("어떤 종류의 막힘");
    clock.set(new Date("2026-09-04T01:11:00.000Z"));
    const hardRecovery = await service.handleFocusMessage(message("너무 어려워", "hard-reason"));
    expect(hardRecovery.reply).toContain("두 개의 더 작은 실행 단위");
    clock.set(new Date("2026-09-04T01:12:00.000Z"));
    const resumed = await service.handleFocusMessage(message("다시 할게", "resume-hard"));
    expect(resumed.reply).toContain("어려운 Step (1/2)");
    const splitSteps = await sql<{ title: string; position: number }[]>`
      select title,position from public.task_steps where task_id=${taskIds[1]} order by position
    `;
    expect(splitSteps).toEqual([
      { title: "어려운 Step (1/2)", position: 1 },
      { title: "어려운 Step (2/2)", position: 2 }
    ]);

    clock.set(new Date("2026-09-04T01:20:00.000Z"));
    const guardrail = await service.handleFocusMessage(message("다른 거 할래", "switch-1"));
    expect(guardrail.reply).toContain("한 번 더");
    const stillActive = await sql<{ count: number }[]>`select count(*)::int count from public.focus_sessions where user_id=${userA} and status='active'`;
    expect(stillActive[0]?.count).toBe(1);
    clock.set(new Date("2026-09-04T01:25:00.000Z"));
    const switched = await service.handleFocusMessage(message("다음 거 할래", "switch-2"));
    expect(switched.reply).toContain("자료 필요한 과제");
    const switchedState = await sql<{ task_status: string; session_status: string; end_reason: string; replan_events: number }[]>`
      select t.status task_status,f.status session_status,f.end_reason,
        (select count(*)::int from public.domain_events where user_id=${userA} and event_type='replan_triggered') replan_events
      from public.tasks t join public.focus_sessions f on f.task_id=t.id and f.user_id=t.user_id
      where t.id=${taskIds[1]} order by f.created_at desc limit 1
    `;
    expect(switchedState[0]).toEqual({ task_status: "IN_PROGRESS", session_status: "paused", end_reason: "task_switched", replan_events: 1 });

    clock.set(new Date("2026-09-04T01:30:00.000Z"));
    await service.handleFocusMessage(message("시작", "start-missing"));
    clock.set(new Date("2026-09-04T01:35:00.000Z"));
    await service.handleFocusMessage(message("막혔어", "block-missing"));
    const missingPrompt = await service.handleFocusMessage(message("교수님 자료가 없어", "missing-category"));
    expect(missingPrompt.reply).toContain("어떤 자료나 누구");
    const missingRecovery = await service.handleFocusMessage(message("교수님 강의자료", "missing-detail"));
    expect(missingRecovery.reply).toContain("다음 할 일은 다음 과제");
    const blocked = await sql<{ status: string; reason: string; category: string }[]>`
      select t.status,e.payload->>'reason' reason,e.payload->>'category' category
      from public.tasks t join public.domain_events e on e.aggregate_id=t.id and e.user_id=t.user_id and e.event_type='task_blocked'
      where t.id=${taskIds[2]}
    `;
    expect(blocked[0]).toEqual({ status: "BLOCKED", reason: "교수님 강의자료", category: "missing_material" });
    clock.set(new Date("2026-09-04T01:40:00.000Z"));
    const materialResume = await service.handleFocusMessage(message("다시 할게", "resume-missing"));
    expect(materialResume.reply).toContain("자료 반영");
    const resumedTask = await sql<{ status: string; active: number }[]>`
      select status,(select count(*)::int from public.focus_sessions where user_id=${userA} and status='active') active
      from public.tasks where id=${taskIds[2]}
    `;
    expect(resumedTask[0]).toEqual({ status: "IN_PROGRESS", active: 1 });

    const eventCountBefore = await sql<{ count: number }[]>`select count(*)::int count from public.domain_events where user_id=${userB}`;
    const foreignComplete = await service.handleFocusMessage(message("완료", "foreign", userB));
    const eventCountAfter = await sql<{ count: number }[]>`select count(*)::int count from public.domain_events where user_id=${userB}`;
    expect(foreignComplete.reply).toContain("없어");
    expect(eventCountAfter[0]?.count).toBe(eventCountBefore[0]?.count);
  });
});
