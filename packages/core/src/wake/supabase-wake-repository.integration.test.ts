import { randomUUID } from "node:crypto";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WakeWorkflowService } from "./wake-service.js";
import { SupabaseWakeRepository } from "./supabase-wake-repository.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userA = randomUUID() as UserId;
const userB = randomUUID() as UserId;
const constraintId = randomUUID();
const now = new Date("2026-09-04T00:00:00.000Z");
const repository = new SupabaseWakeRepository(sql);
const service = new WakeWorkflowService({ repository, clock: new FixedClock(now) });

const message = (userId: UserId, text: string, id: string) => ({
  userId, timeZone: "Asia/Seoul", text, messageId: `discord:${id}`, receivedAt: now
});

beforeAll(async () => {
  await sql`
    insert into auth.users(id,email,created_at,updated_at) values
      (${userA},${`wake-a-${userA}@example.test`},now(),now()),
      (${userB},${`wake-b-${userB}@example.test`},now(),now())
  `;
  await sql`insert into public.profiles(id,timezone) values(${userA},'Asia/Seoul'),(${userB},'Asia/Seoul')`;
  await sql`
    insert into public.user_settings(user_id,wake_policy) values
      (${userA},'{}'),(${userB},'{}')
  `;
  await sql`
    insert into public.integration_accounts(user_id,provider,external_account_id,status,connected_at) values
      (${userA},'discord','123456789012345678','active',now()),
      (${userB},'discord','223456789012345678','active',now())
  `;
  await sql`
    insert into public.constraints(id,user_id,constraint_type,value,hardness,valid_from,valid_until,reason,origin)
    values(${constraintId},${userA},'availability',${sql.json({ title: "수업", blocksCapacity: true })},'hard',
      ${new Date("2026-09-05T01:00:00.000Z")},${new Date("2026-09-05T02:00:00.000Z")},'calendar','google_calendar')
  `;
  await sql`
    insert into public.external_references(
      user_id,source,external_type,external_id,ownership,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at
    ) values(${userA},'google_calendar','event','wake-event','external','constraint',${constraintId},'active',now(),now())
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userA},${userB})`;
  await sql.end();
});

describe("Supabase Wake workflow", () => {
  it("observes the first fixed Calendar constraint without inventing a target", async () => {
    const context = await repository.loadTargetContext(userA, "2026-09-05", "Asia/Seoul");
    expect(context).toEqual({
      preferredWakeTime: null,
      preferenceSource: null,
      firstConstraint: { title: "수업", start: new Date("2026-09-05T01:00:00.000Z") }
    });
    await expect(service.afterDayClose(message(userA, "오늘 끝", "close")))
      .resolves.toBe("내일 첫 일정은 10:00 수업이야. 몇 시에 깨울까?");
  });

  it("uses an explicit wake preference without asking for the time again", async () => {
    await sql`update public.user_settings set wake_policy=${sql.json({ defaultWakeTime: "07:30" })} where user_id=${userB}`;
    await expect(service.afterDayClose(message(userB, "오늘 끝", "preferred")))
      .resolves.toContain("07:30에 깨울게");
    const workflow = await repository.findWorkflow(userB, "2026-09-05");
    expect(workflow?.checkpoint).toMatchObject({
      targetDate: "2026-09-05", wakeAt: "2026-09-04T22:30:00.000Z", source: "preference"
    });
  });

  it("keeps one date target and replaces the prior schedule", async () => {
    await service.handleWakeMessage(message(userA, "내일 8시에 깨워줘", "set-8"));
    await service.handleWakeMessage(message(userA, "내일 8시에 깨워줘", "set-8"));
    await service.handleWakeMessage(message(userA, "내일 9시에 깨워줘", "set-9"));
    await service.handleWakeMessage(message(userB, "내일 10시에 깨워줘", "set-b"));

    const rows = await sql<{
      workflow_count: number; active_count: number; cancelled_count: number; wake_at: string;
      other_workflows: number; other_active: number;
    }[]>`
      select
        (select count(*)::int from public.workflow_runs where user_id=${userA} and workflow_type='wake') workflow_count,
        (select count(*)::int from public.notifications where user_id=${userA} and status='scheduled') active_count,
        (select count(*)::int from public.notifications where user_id=${userA} and status='cancelled') cancelled_count,
        (select checkpoint_state->>'wakeAt' from public.workflow_runs where user_id=${userA} and workflow_type='wake') wake_at,
        (select count(*)::int from public.workflow_runs where user_id=${userB} and workflow_type='wake') other_workflows,
        (select count(*)::int from public.notifications where user_id=${userB} and status='scheduled') other_active
    `;
    expect(rows[0]).toEqual({
      workflow_count: 1, active_count: 1, cancelled_count: 1,
      wake_at: "2026-09-05T00:00:00.000Z", other_workflows: 1, other_active: 1
    });
  });

  it("claims a due delivery once across concurrent workers and leaves failure retryable", async () => {
    expect(await repository.claimDue(new Date("2026-09-04T23:59:59.000Z"))).toBeNull();
    const competing = new SupabaseWakeRepository(sql);
    const claims = await Promise.all([
      repository.claimDue(new Date("2026-09-05T00:00:01.000Z")),
      competing.claimDue(new Date("2026-09-05T00:00:01.000Z"))
    ]);
    const claimed = claims.filter((value) => value !== null);
    expect(claimed).toHaveLength(1);
    const first = claimed[0]!;
    expect(first.userId).toBe(userA);

    await repository.failDelivery(first, "temporary Discord error", new Date("2026-09-05T00:00:02.000Z"));
    const retried = await competing.claimDue(new Date("2026-09-05T00:00:03.000Z"));
    expect(retried?.notificationId).toBe(first.notificationId);
    await competing.completeDelivery(retried!, new Date("2026-09-05T00:00:04.000Z"));
    expect(await repository.claimDue(new Date("2026-09-05T00:00:05.000Z"))).toBeNull();

    const state = await sql<{ notification_status: string; sent_at: Date | null; attempt_count: number }[]>`
      select n.status notification_status,n.sent_at,j.attempt_count from public.notifications n
      join public.scheduled_jobs j on (j.payload->>'notificationId')::uuid=n.id
      where n.id=${first.notificationId}
    `;
    expect(state[0]?.notification_status).toBe("sent");
    expect(state[0]?.sent_at).toEqual(new Date("2026-09-05T00:00:04.000Z"));
    expect(state[0]?.attempt_count).toBe(2);
  });

  it("snoozes idempotently, acknowledges sent Wake, and cancels an early pending Wake", async () => {
    const snoozeAt = new Date("2026-09-05T00:10:00.000Z");
    await expect(repository.snooze(userA, "2026-09-05", snoozeAt, "discord:snooze", snoozeAt)).resolves.toBe(true);
    await expect(repository.snooze(userA, "2026-09-05", snoozeAt, "discord:snooze", snoozeAt)).resolves.toBe(true);
    expect((await sql<{ count: number }[]>`
      select count(*)::int count from public.notifications where user_id=${userA} and dedupe_key='wake-snooze:discord:snooze'
    `)[0]?.count).toBe(1);

    await repository.acknowledgeForDate(userA, "2026-09-05", "discord:awake", new Date("2026-09-05T00:05:00.000Z"));
    await repository.acknowledgeForDate(userB, "2026-09-05", "discord:early", new Date("2026-09-05T00:30:00.000Z"));
    const states = await sql<{ user_id: string; workflow_step: string; scheduled: number; acknowledged: number }[]>`
      select w.user_id,w.current_step workflow_step,
        count(n.id) filter(where n.status='scheduled')::int scheduled,
        count(n.id) filter(where n.status='acknowledged')::int acknowledged
      from public.workflow_runs w left join public.notifications n on n.workflow_run_id=w.id and n.user_id=w.user_id
      where w.user_id in (${userA},${userB}) and w.workflow_type='wake'
      group by w.user_id,w.current_step order by w.user_id
    `;
    const a = states.find((row) => row.user_id === userA);
    const b = states.find((row) => row.user_id === userB);
    expect(a).toMatchObject({ workflow_step: "acknowledged", scheduled: 0, acknowledged: 1 });
    expect(b).toMatchObject({ workflow_step: "acknowledged", scheduled: 0, acknowledged: 0 });
  });
});
