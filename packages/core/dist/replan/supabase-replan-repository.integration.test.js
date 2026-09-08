import { randomUUID } from "node:crypto";
import { FixedClock } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseMorningRepository } from "../morning/supabase-morning-repository.js";
import { DynamicReplanningService } from "./replan-service.js";
import { SupabaseReplanRepository } from "./supabase-replan-repository.js";
const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const smallUser = randomUUID();
const importantUser = randomUUID();
const rejectedUser = randomUUID();
const expiredUser = randomUUID();
const otherUser = randomUUID();
const smallTask = randomUUID();
const importantTask = randomUUID();
const rejectedTask = randomUUID();
const expiredTask = randomUUID();
const smallPlan = randomUUID();
const importantPlan = randomUUID();
const rejectedPlan = randomUUID();
const expiredPlan = randomUUID();
const now = new Date("2026-09-04T03:00:00.000Z");
const clock = new FixedClock(now);
const repository = new SupabaseReplanRepository(sql);
const morningRepository = new SupabaseMorningRepository(sql);
const service = new DynamicReplanningService({ repository, observationReader: morningRepository, clock });
beforeAll(async () => {
    await sql `
    insert into auth.users(id,email,created_at,updated_at) values
      (${smallUser},${`replan-${smallUser}@example.test`},now(),now()),
      (${importantUser},${`replan-${importantUser}@example.test`},now(),now()),
      (${rejectedUser},${`replan-${rejectedUser}@example.test`},now(),now()),
      (${expiredUser},${`replan-${expiredUser}@example.test`},now(),now()),
      (${otherUser},${`replan-${otherUser}@example.test`},now(),now())
  `;
    await sql `insert into public.profiles(id,timezone) values (${smallUser},'Asia/Seoul'),(${importantUser},'Asia/Seoul'),(${rejectedUser},'Asia/Seoul'),(${expiredUser},'Asia/Seoul'),(${otherUser},'Asia/Seoul')`;
    await sql `insert into public.user_settings(user_id,planning_buffer_minutes,week_starts_on) values (${smallUser},15,1),(${importantUser},15,1),(${rejectedUser},15,1),(${expiredUser},15,1),(${otherUser},0,1)`;
    await sql `
    insert into public.tasks(id,user_id,title,execution_mode,official_deadline,estimated_minutes,actual_minutes,importance,status)
    values
      (${smallTask},${smallUser},'작은 변경 과제','standard',null,60,10,3,'IN_PROGRESS'),
      (${importantTask},${importantUser},'마감 임박 과제','standard',${new Date("2026-09-04T03:20:00.000Z")},60,0,5,'IN_PROGRESS'),
      (${rejectedTask},${rejectedUser},'거절할 중요 과제','standard',${new Date("2026-09-04T03:20:00.000Z")},60,0,5,'IN_PROGRESS'),
      (${expiredTask},${expiredUser},'만료할 중요 과제','standard',${new Date("2026-09-04T03:20:00.000Z")},60,0,5,'IN_PROGRESS')
  `;
    const snapshot = (planId) => sql.json({
        workUntil: "2026-09-04T06:00:00.000Z", privateIntervals: [], fixedEvents: [], seed: planId
    });
    await sql `
    insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by,approved_at)
    values
      (${smallPlan},${smallUser},'2026-09-04','Asia/Seoul',1,'draft',${snapshot(smallPlan)},'test',${now}),
      (${importantPlan},${importantUser},'2026-09-04','Asia/Seoul',1,'draft',${snapshot(importantPlan)},'test',${now}),
      (${rejectedPlan},${rejectedUser},'2026-09-04','Asia/Seoul',1,'draft',${snapshot(rejectedPlan)},'test',${now}),
      (${expiredPlan},${expiredUser},'2026-09-04','Asia/Seoul',1,'draft',${snapshot(expiredPlan)},'test',${now})
  `;
    await sql `
    insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,planned_start_at,planned_end_at,planned_minutes,status)
    values
      (${smallUser},${smallPlan},1,'task',${smallTask},${now},${new Date("2026-09-04T04:00:00.000Z")},60,'in_progress'),
      (${importantUser},${importantPlan},1,'task',${importantTask},${now},${new Date("2026-09-04T04:00:00.000Z")},60,'in_progress'),
      (${rejectedUser},${rejectedPlan},1,'task',${rejectedTask},${now},${new Date("2026-09-04T04:00:00.000Z")},60,'in_progress'),
      (${expiredUser},${expiredPlan},1,'task',${expiredTask},${now},${new Date("2026-09-04T04:00:00.000Z")},60,'in_progress')
  `;
    await sql `update public.daily_plans set status='approved',approved_at=${now} where id in (${smallPlan},${importantPlan},${rejectedPlan},${expiredPlan})`;
});
afterAll(async () => {
    await sql `delete from auth.users where id in (${smallUser},${importantUser},${rejectedUser},${expiredUser},${otherUser})`;
    await sql.end();
});
describe("Supabase dynamic replanning", () => {
    it("creates one immutable auto-approved revision for a duplicate manual trigger", async () => {
        const message = { userId: smallUser, timeZone: "Asia/Seoul", text: "오늘 일정 다시 짜줘", messageId: "discord:manual-small", receivedAt: now };
        const first = await service.handleReplanMessage(message);
        const duplicate = await service.handleReplanMessage(message);
        expect(first.reply).toContain("일정 조금 조정했어");
        expect(duplicate.reply).toContain("이미 일정을 조정했어");
        const plans = await sql `
      select id,revision_no,status from public.daily_plans where user_id=${smallUser} order by revision_no
    `;
        expect(plans).toEqual([
            { id: smallPlan, revision_no: 1, status: "superseded" },
            { id: expect.any(String), revision_no: 2, status: "approved" }
        ]);
        const originalItems = await sql `
      select planned_start_at,planned_end_at,planned_minutes from public.plan_items where daily_plan_id=${smallPlan}
    `;
        expect(originalItems[0]).toEqual({
            planned_start_at: now,
            planned_end_at: new Date("2026-09-04T04:00:00.000Z"),
            planned_minutes: 60
        });
        const current = await repository.deriveCurrentAction(smallUser, "2026-09-04");
        expect(current).toMatchObject({ source: "plan_item", taskId: smallTask, title: "작은 변경 과제" });
        const events = await sql `
      select
        count(*) filter(where event_type='plan_replanned')::int replanned,
        count(*) filter(where event_type='plan_approved')::int approved,
        count(*) filter(where event_type='replan_executed')::int executed
      from public.domain_events where user_id=${smallUser}
    `;
        expect(events[0]).toEqual({ replanned: 1, approved: 1, executed: 1 });
        expect(await repository.loadPlanState(otherUser, "2026-09-04")).toBeNull();
    });
    it("creates an important proposed revision and approves it through the durable approval", async () => {
        await sql `
      insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${importantUser},'replan_triggered','daily_plan',${importantPlan},'system',${now},gen_random_uuid(),'important-trigger',1,
        ${sql.json({ reason: "task_overrun", delta_minutes: 20, replan_executed: false })})
    `;
        const proposal = await service.processLatestTrigger(importantUser, "Asia/Seoul", now);
        expect(proposal).toContain("중요한 일정 변경");
        expect(proposal).toContain("승인");
        const before = await sql `
      select revision_no,status from public.daily_plans where user_id=${importantUser} order by revision_no
    `;
        expect(before).toEqual([{ revision_no: 1, status: "approved" }, { revision_no: 2, status: "pending_approval" }]);
        const approval = await service.handleReplanMessage({
            userId: importantUser, timeZone: "Asia/Seoul", text: "승인", messageId: "discord:important-approval", receivedAt: now
        });
        const duplicateApproval = await service.handleReplanMessage({
            userId: importantUser, timeZone: "Asia/Seoul", text: "승인", messageId: "discord:important-approval", receivedAt: now
        });
        expect(approval.reply).toContain("새 계획을 승인했어");
        expect(duplicateApproval.reply).toBe("이미 새 계획을 승인했어.");
        const after = await sql `
      select
        p.revision_no,p.status,
        (select count(*)::int from public.daily_plans where user_id=${importantUser} and status='approved') approved_count,
        (select count(*)::int from public.approval_requests where user_id=${importantUser} and status='approved') approval_count
      from public.daily_plans p where p.user_id=${importantUser} order by p.revision_no
    `;
        expect(after).toEqual([
            { revision_no: 1, status: "superseded", approved_count: 1, approval_count: 1 },
            { revision_no: 2, status: "approved", approved_count: 1, approval_count: 1 }
        ]);
    });
    it("keeps the approved plan when an important replacement is rejected", async () => {
        await sql `
      insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${rejectedUser},'replan_triggered','daily_plan',${rejectedPlan},'system',${now},gen_random_uuid(),'rejected-trigger',1,
        ${sql.json({ reason: "task_overrun", delta_minutes: 20, replan_executed: false })})
    `;
        await service.processLatestTrigger(rejectedUser, "Asia/Seoul", now);
        await service.handleReplanMessage({
            userId: rejectedUser, timeZone: "Asia/Seoul", text: "거절", messageId: "discord:important-rejection", receivedAt: now
        });
        const plans = await sql `
      select revision_no,status from public.daily_plans where user_id=${rejectedUser} order by revision_no
    `;
        expect(plans).toEqual([{ revision_no: 1, status: "approved" }, { revision_no: 2, status: "superseded" }]);
    });
    it("keeps the approved plan when replacement approval is no longer pending", async () => {
        await sql `
      insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
      values(${expiredUser},'replan_triggered','daily_plan',${expiredPlan},'system',${now},gen_random_uuid(),'expired-trigger',1,
        ${sql.json({ reason: "task_overrun", delta_minutes: 20, replan_executed: false })})
    `;
        await service.processLatestTrigger(expiredUser, "Asia/Seoul", now);
        await sql `update public.approval_requests set status='expired' where user_id=${expiredUser} and status='pending'`;
        await expect(service.handleReplanMessage({
            userId: expiredUser, timeZone: "Asia/Seoul", text: "승인", messageId: "discord:expired-approval", receivedAt: now
        })).rejects.toThrow("Approval request is no longer pending");
        const plans = await sql `
      select revision_no,status from public.daily_plans where user_id=${expiredUser} order by revision_no
    `;
        expect(plans).toEqual([{ revision_no: 1, status: "approved" }, { revision_no: 2, status: "pending_approval" }]);
    });
});
//# sourceMappingURL=supabase-replan-repository.integration.test.js.map