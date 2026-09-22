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
const otherUser = randomUUID();
const smallTask = randomUUID();
const importantTask = randomUUID();
const smallPlan = randomUUID();
const importantPlan = randomUUID();
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
      (${otherUser},${`replan-${otherUser}@example.test`},now(),now())
  `;
    await sql `insert into public.profiles(id,timezone) values (${smallUser},'Asia/Seoul'),(${importantUser},'Asia/Seoul'),(${otherUser},'Asia/Seoul')`;
    await sql `insert into public.user_settings(user_id,planning_buffer_minutes,week_starts_on) values (${smallUser},15,1),(${importantUser},15,1),(${otherUser},0,1)`;
    await sql `
    insert into public.tasks(id,user_id,title,execution_mode,official_deadline,estimated_minutes,actual_minutes,importance,status)
    values
      (${smallTask},${smallUser},'작은 변경 과제','standard',null,60,10,3,'IN_PROGRESS'),
      (${importantTask},${importantUser},'마감 임박 과제','standard',${new Date("2026-09-04T03:20:00.000Z")},60,0,5,'IN_PROGRESS')
  `;
    const snapshot = (planId) => sql.json({
        workUntil: "2026-09-04T06:00:00.000Z", privateIntervals: [], fixedEvents: [], seed: planId
    });
    await sql `
    insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by,approved_at)
    values
      (${smallPlan},${smallUser},'2026-09-04','Asia/Seoul',1,'draft',${snapshot(smallPlan)},'test',${now}),
      (${importantPlan},${importantUser},'2026-09-04','Asia/Seoul',1,'draft',${snapshot(importantPlan)},'test',${now})
  `;
    await sql `
    insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,planned_start_at,planned_end_at,planned_minutes,status)
    values
      (${smallUser},${smallPlan},1,'task',${smallTask},${now},${new Date("2026-09-04T04:00:00.000Z")},60,'in_progress'),
      (${importantUser},${importantPlan},1,'task',${importantTask},${now},${new Date("2026-09-04T04:00:00.000Z")},60,'in_progress')
  `;
    await sql `update public.daily_plans set status='approved',approved_at=${now} where id in (${smallPlan},${importantPlan})`;
});
afterAll(async () => {
    await sql `delete from auth.users where id in (${smallUser},${importantUser},${otherUser})`;
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
    it("keeps the approved plan before review, then persists the approved rest revision and current action", async () => {
        const proposal = await service.handleReplanMessage({
            userId: importantUser, timeZone: "Asia/Seoul", text: "나 지금 2시간 쉬고 싶어", messageId: "web:rest-proposal", receivedAt: now
        });
        expect(proposal.reply).toContain("중요한 일정 변경");
        expect(proposal.reply).toContain("승인");
        const before = await sql `
      select revision_no,status from public.daily_plans where user_id=${importantUser} order by revision_no
    `;
        expect(before).toEqual([{ revision_no: 1, status: "approved" }, { revision_no: 2, status: "pending_approval" }]);
        expect(await repository.deriveCurrentAction(importantUser, "2026-09-04")).toMatchObject({ taskId: importantTask });
        const rejection = await service.handleReplanMessage({
            userId: importantUser, timeZone: "Asia/Seoul", text: "거절", messageId: "web:rest-reject", receivedAt: now
        });
        expect(rejection.reply).toContain("기존 계획을 유지할게");
        expect(await sql `
      select revision_no,status from public.daily_plans where user_id=${importantUser} order by revision_no
    `).toEqual([{ revision_no: 1, status: "approved" }, { revision_no: 2, status: "superseded" }]);
        expect(await repository.deriveCurrentAction(importantUser, "2026-09-04")).toMatchObject({ taskId: importantTask });
        await service.handleReplanMessage({
            userId: importantUser, timeZone: "Asia/Seoul", text: "나 지금 1시간 쉬고 싶어", messageId: "web:rest-proposal-v2", receivedAt: now
        });
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
        (select count(*)::int from public.daily_plans where user_id=${importantUser} and status='approved') approved,
        (select count(*)::int from public.approval_requests where user_id=${importantUser} and status='approved') approval
    `;
        expect(after[0]).toEqual({ approved: 1, approval: 1 });
        const persisted = await repository.loadPlanState(importantUser, "2026-09-04");
        expect(persisted).toMatchObject({ revisionNo: 3 });
        expect(await repository.deriveCurrentAction(importantUser, "2026-09-04")).toMatchObject({ source: "plan_item", title: "휴식" });
        const editable = persisted.items[0];
        await service.editPlan({
            userId: importantUser, planId: persisted.planId, receivedAt: now, idempotencyKey: "direct-edit-reject",
            edit: { kind: "exclude", itemId: editable.id }
        });
        expect(await sql `
      select revision_no,status from public.daily_plans where user_id=${importantUser} and revision_no in (3,4) order by revision_no
    `).toEqual([{ revision_no: 3, status: "approved" }, { revision_no: 4, status: "pending_approval" }]);
        await service.handleReplanMessage({
            userId: importantUser, timeZone: "Asia/Seoul", text: "거절", messageId: "web:direct-reject", receivedAt: now
        });
        expect((await repository.loadPlanState(importantUser, "2026-09-04"))?.revisionNo).toBe(3);
        await service.editPlan({
            userId: importantUser, planId: persisted.planId, receivedAt: now, idempotencyKey: "direct-edit-approve",
            edit: { kind: "reschedule", itemId: editable.id, start: editable.start, durationMinutes: Math.max(5, editable.plannedMinutes - 5) }
        });
        await service.handleReplanMessage({
            userId: importantUser, timeZone: "Asia/Seoul", text: "승인", messageId: "web:direct-approve", receivedAt: now
        });
        expect(await sql `
      select revision_no,status from public.daily_plans where user_id=${importantUser} and revision_no in (3,5) order by revision_no
    `).toEqual([{ revision_no: 3, status: "superseded" }, { revision_no: 5, status: "approved" }]);
        const approvedV5 = await repository.loadPlanState(importantUser, "2026-09-04");
        const firstEdit = await service.editPlan({
            userId: importantUser, planId: approvedV5.planId, receivedAt: now, idempotencyKey: "direct-edit-first-proposal",
            edit: { kind: "reschedule", itemId: approvedV5.items[0].id, start: approvedV5.items[0].start, durationMinutes: 20 }
        });
        const pendingState = await repository.loadEditablePlanState(importantUser, firstEdit.plan.id);
        await service.editPlan({
            userId: importantUser, planId: firstEdit.plan.id, receivedAt: now, idempotencyKey: "direct-edit-replace-proposal",
            edit: { kind: "reschedule", itemId: pendingState.items[0].id, start: pendingState.items[0].start, durationMinutes: 15 }
        });
        expect(await sql `
      select revision_no,status from public.daily_plans where user_id=${importantUser} and revision_no in (5,6,7) order by revision_no
    `).toEqual([
            { revision_no: 5, status: "approved" },
            { revision_no: 6, status: "superseded" },
            { revision_no: 7, status: "pending_approval" }
        ]);
    });
});
//# sourceMappingURL=supabase-replan-repository.integration.test.js.map