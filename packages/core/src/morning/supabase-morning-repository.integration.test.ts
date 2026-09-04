import { randomUUID } from "node:crypto";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MorningWorkflowService } from "./morning-service.js";
import { SupabaseMorningRepository } from "./supabase-morning-repository.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userA = randomUUID() as UserId;
const userB = randomUUID() as UserId;
const taskA = randomUUID();
const taskB = randomUUID();
const activityA = randomUUID();
const fixedStart = new Date("2026-09-04T01:00:00.000Z");
const fixedEnd = new Date("2026-09-04T02:00:00.000Z");
const clock = new FixedClock(new Date("2026-09-04T00:00:00.000Z"));
const repository = new SupabaseMorningRepository(sql);
const service = new MorningWorkflowService({ repository, clock });

beforeAll(async () => {
  await sql`
    insert into auth.users(id,email,created_at,updated_at) values
      (${userA},${`morning-${userA}@example.test`},now(),now()),
      (${userB},${`morning-${userB}@example.test`},now(),now())
  `;
  await sql`insert into public.profiles(id,timezone) values (${userA},'Asia/Seoul'),(${userB},'Asia/Seoul')`;
  await sql`insert into public.user_settings(user_id,planning_buffer_minutes,week_starts_on) values (${userA},30,1),(${userB},0,1)`;
  await sql`
    insert into public.tasks(id,user_id,title,execution_mode,official_deadline,estimated_minutes,importance,status)
    values
      (${taskA},${userA},'데이터구조 과제','standard','2026-09-04T14:59:59Z',60,5,'INBOX'),
      (${taskB},${userB},'다른 사용자의 비공개 과제','standard','2026-09-04T14:59:59Z',60,5,'INBOX')
  `;
  await sql`
    insert into public.constraints(user_id,constraint_type,value,hardness,valid_from,valid_until,reason,origin)
    values(${userA},'availability',${sql.json({ title: "수업", blocksCapacity: true })},'hard',${fixedStart},${fixedEnd},'fixed event','google_calendar')
  `;
  await sql`
    insert into public.recurring_activities(id,user_id,title,category,period,target_count,expected_minutes,minimum_minutes,scheduling_mode,preferred_days,importance,effective_from,active)
    values(${activityA},${userA},'일본어','study','week',1,30,20,'flexible',array[5]::smallint[],4,'2026-09-01',true)
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userA},${userB})`;
  await sql.end();
});

const message = (text: string, id: string) => ({
  userId: userA, timeZone: "Asia/Seoul", text, messageId: `discord:${id}`,
  receivedAt: new Date("2026-09-04T00:00:00.000Z")
});

describe("SupabaseMorningRepository workflow", () => {
  it("persists observe, immutable proposal revisions, approval, events, and current action idempotently", async () => {
    const wake = await service.handleMorningMessage(message("일어남", "wake-1"));
    const repeatedWake = await service.handleMorningMessage(message("일어남", "wake-2"));
    expect(wake.reply).toContain("몇 시까지");
    expect(repeatedWake.reply).toBe(wake.reply);

    const workflowCount = await sql<{ count: number }[]>`select count(*)::int count from public.workflow_runs where user_id=${userA}`;
    expect(workflowCount[0]?.count).toBe(1);
    const proposal = await service.handleMorningMessage(message("오후 6시까지", "context"));
    expect(proposal.reply).toContain("데이터구조 과제");
    expect(proposal.reply).toContain("수업");
    expect(proposal.reply).toContain("일본어");
    expect(proposal.reply).not.toContain("다른 사용자의 비공개 과제");
    const repeatedContext = await service.handleMorningMessage(message("오후 6시까지", "context"));
    expect(repeatedContext.reply).toBe(proposal.reply);

    const planOne = await sql<{ id: string; status: string; input_snapshot: { constraintIds: string[] } }[]>`
      select id,status,input_snapshot from public.daily_plans where user_id=${userA} and revision_no=1
    `;
    const itemsOne = await sql<{ item_type: string; planned_start_at: Date; planned_end_at: Date; planned_minutes: number }[]>`
      select item_type,planned_start_at,planned_end_at,planned_minutes from public.plan_items where user_id=${userA} and daily_plan_id=${planOne[0]!.id}
    `;
    expect(planOne[0]?.input_snapshot.constraintIds).toHaveLength(1);
    expect(itemsOne.some((item) => item.item_type === "routine")).toBe(true);
    expect(itemsOne.some((item) => item.item_type === "buffer" && item.planned_minutes === 30)).toBe(true);
    expect(itemsOne.every((item) => item.planned_end_at <= fixedStart || item.planned_start_at >= fixedEnd)).toBe(true);
    expect(itemsOne.reduce((sum, item) => sum + item.planned_minutes, 0)).toBeLessThanOrEqual(480);

    await service.handleMorningMessage(message("다시 짜줘", "revise"));
    await service.handleMorningMessage(message("다시 짜줘", "revise"));
    const plans = await sql<{ id: string; revision_no: number; status: string }[]>`
      select id,revision_no,status from public.daily_plans where user_id=${userA} order by revision_no
    `;
    expect(plans.map((plan) => ({ revision: plan.revision_no, status: plan.status }))).toEqual([
      { revision: 1, status: "superseded" },
      { revision: 2, status: "pending_approval" }
    ]);
    expect(plans[0]?.id).toBe(planOne[0]?.id);

    const approved = await service.handleMorningMessage(message("승인", "approval"));
    const duplicate = await service.handleMorningMessage(message("승인", "approval"));
    expect(approved.reply).toContain("첫 할 일은 데이터구조 과제");
    expect(duplicate.reply).toBe(approved.reply);
    const state = await sql<{ approved_count: number; created_events: number; replanned_events: number; approved_events: number; approval_count: number; cancelled_approval_count: number }[]>`
      select
        (select count(*)::int from public.daily_plans where user_id=${userA} and status='approved') approved_count,
        (select count(*)::int from public.domain_events where user_id=${userA} and event_type='plan_created') created_events,
        (select count(*)::int from public.domain_events where user_id=${userA} and event_type='plan_replanned') replanned_events,
        (select count(*)::int from public.domain_events where user_id=${userA} and event_type='plan_approved') approved_events,
        (select count(*)::int from public.approval_requests where user_id=${userA} and status='approved') approval_count,
        (select count(*)::int from public.approval_requests where user_id=${userA} and status='cancelled') cancelled_approval_count
    `;
    expect(state[0]).toEqual({
      approved_count: 1, created_events: 1, replanned_events: 1, approved_events: 1,
      approval_count: 1, cancelled_approval_count: 1
    });
    expect(await repository.findTodayWorkflow(userB, "2026-09-04")).toBeNull();
  });
});
