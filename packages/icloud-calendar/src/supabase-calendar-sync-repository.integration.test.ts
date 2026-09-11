import { randomUUID } from "node:crypto";
import type { NormalizedCalendarEvent } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ICloudCalendarAccount, ICloudCalendarCollection } from "./contracts.js";
import { SupabaseICloudCalendarSyncRepository } from "./supabase-calendar-sync-repository.js";
import { syncICloudCalendarForUser } from "./runtime-sync.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 10 });
const userA = randomUUID();
const userB = randomUUID();
const accountId = randomUUID();
const now = new Date("2026-09-04T00:00:00Z");
const window = { start: new Date("2026-08-28T00:00:00Z"), end: new Date("2026-12-03T00:00:00Z") };
const collection: ICloudCalendarCollection = {
  id: "https://caldav.icloud.test/1/calendars/classes/",
  name: "대학교 수업",
  ctag: "ctag-1",
  syncToken: "sync-1",
  timeZone: "Asia/Seoul"
};

const makeEvent = (overrides: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent => ({
  source: "icloud_calendar",
  ownership: "external",
  calendarId: collection.id,
  externalEventId: "event-1",
  externalVersion: '"etag-1"',
  title: "수업",
  start: "2026-09-04T01:30:00.000Z",
  end: "2026-09-04T02:30:00.000Z",
  allDay: false,
  timeZone: "Asia/Seoul",
  recurringEventId: "series-1",
  originalStart: "2026-09-04T10:30:00",
  status: "confirmed",
  transparency: "opaque",
  visibility: "PUBLIC",
  contentHash: "a".repeat(64),
  ...overrides
});

beforeAll(async () => {
  for (const id of [userA, userB]) {
    await sql`insert into auth.users(id,email,created_at,updated_at) values (${id},${`${id}@icloud.test`},now(),now())`;
    await sql`insert into public.profiles(id,timezone) values (${id},'Asia/Seoul')`;
  }
  await sql`
    insert into public.integration_accounts(id,user_id,provider,external_account_id,status,secret_ref,metadata,connected_at)
    values (${accountId},${userA},'icloud_calendar','apple-id@example.test','active','env:ICLOUD_APP_PASSWORD',${sql.json({})},now())
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userA},${userB})`;
  await sql.end();
});

describe("Supabase iCloud Calendar reconciliation", () => {
  it("returns a safe no-op before loading credentials when no active account exists", async () => {
    await expect(syncICloudCalendarForUser({ sql, userId: userB, environment: {} })).resolves.toBeNull();
  });

  it("creates, deduplicates, updates, tombstones, restores, and isolates fixed constraints", async () => {
    const repository = new SupabaseICloudCalendarSyncRepository(sql);
    const account = await repository.getActiveAccount(userA) as ICloudCalendarAccount;

    expect(await repository.applyCollectionSync({ account, collection, events: [makeEvent()], window, synchronizedAt: now }))
      .toEqual({ active: 1, deleted: 0 });
    expect(await repository.listFixedTimeConstraints(userA, window.start, window.end)).toHaveLength(1);
    expect(await repository.listFixedTimeConstraints(userB, window.start, window.end)).toHaveLength(0);
    const storedPayload = await sql<{ raw_payload: Record<string, unknown> }[]>`
      select raw_payload from public.inbox_items where user_id=${userA} and source='icloud_calendar'
    `;
    expect(JSON.stringify(storedPayload[0]?.raw_payload)).not.toContain("BEGIN:VCALENDAR");

    expect(await repository.applyCollectionSync({ account, collection, events: [makeEvent()], window, synchronizedAt: now }))
      .toEqual({ active: 0, deleted: 0 });
    expect(await countsForUser(userA)).toMatchObject({ references: 1, constraints: 1, inboxes: 1, commands: 1, events: 1, tasks: 0 });

    const updated = makeEvent({
      externalVersion: '"etag-2"',
      contentHash: "b".repeat(64),
      title: "변경된 수업",
      start: "2026-09-04T03:00:00.000Z",
      end: "2026-09-04T04:00:00.000Z"
    });
    expect(await repository.applyCollectionSync({ account, collection, events: [updated], window, synchronizedAt: now }))
      .toMatchObject({ active: 1, deleted: 0 });
    expect((await repository.listFixedTimeConstraints(userA, window.start, window.end))[0])
      .toMatchObject({ title: "변경된 수업", start: new Date("2026-09-04T03:00:00.000Z"), ownership: "external" });

    expect(await repository.applyCollectionSync({ account, collection, events: [], window, synchronizedAt: now }))
      .toMatchObject({ deleted: 1 });
    expect(await repository.listFixedTimeConstraints(userA, window.start, window.end)).toHaveLength(0);

    const restored = makeEvent({ externalVersion: '"etag-3"', contentHash: "c".repeat(64) });
    expect(await repository.applyCollectionSync({ account, collection, events: [restored], window, synchronizedAt: now }))
      .toMatchObject({ active: 1 });
    expect(await repository.listFixedTimeConstraints(userA, window.start, window.end)).toHaveLength(1);

    const uniqueness = await sql<{ references: number; constraints: number }[]>`
      select count(distinct r.id)::int references,count(distinct c.id)::int constraints
      from public.external_references r join public.constraints c on c.id=r.internal_entity_id
      where r.user_id=${userA} and r.source='icloud_calendar' and r.external_id=${`${collection.id}:event-1`}
    `;
    expect(uniqueness[0]).toEqual({ references: 1, constraints: 1 });
  });

  it("stores collection discovery metadata without credentials or raw event payloads", async () => {
    const repository = new SupabaseICloudCalendarSyncRepository(sql);
    const account = await repository.getActiveAccount(userA) as ICloudCalendarAccount;
    await repository.saveDiscovery(account, {
      principalUrl: "https://caldav.icloud.test/principal/1/",
      calendarHomeUrl: "https://caldav.icloud.test/1/calendars/",
      collections: [collection]
    }, now);
    const rows = await sql<{ metadata: Record<string, unknown>; secret_ref: string }[]>`
      select metadata,secret_ref from public.integration_accounts where id=${accountId}
    `;
    expect(rows[0]?.secret_ref).toBe("env:ICLOUD_APP_PASSWORD");
    expect(JSON.stringify(rows[0]?.metadata)).not.toContain("password");
    expect(JSON.stringify(rows[0]?.metadata)).toContain("대학교 수업");
  });
});

async function countsForUser(userId: string) {
  const rows = await sql<{ references: number; constraints: number; inboxes: number; commands: number; events: number; tasks: number }[]>`
    select
      (select count(*)::int from public.external_references where user_id=${userId} and source='icloud_calendar') references,
      (select count(*)::int from public.constraints c join public.external_references r on r.internal_entity_id=c.id where r.user_id=${userId} and r.source='icloud_calendar') constraints,
      (select count(*)::int from public.inbox_items where user_id=${userId} and source='icloud_calendar') inboxes,
      (select count(*)::int from public.domain_commands where user_id=${userId} and command_type='RECONCILE_CALENDAR_EVENT') commands,
      (select count(*)::int from public.domain_events where user_id=${userId} and event_type='external_calendar_event_reconciled') events,
      (select count(*)::int from public.tasks where user_id=${userId}) tasks
  `;
  return rows[0]!;
}
