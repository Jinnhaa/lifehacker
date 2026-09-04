import { randomUUID } from "node:crypto";
import { FixedClock } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CalendarSyncService } from "./calendar-sync-service.js";
import type { CalendarIntegrationAccount, GoogleCalendarClient, NormalizedCalendarEvent } from "./contracts.js";
import { SupabaseCalendarSyncRepository } from "./supabase-calendar-sync-repository.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 10 });
const userA = randomUUID();
const userB = randomUUID();
const accountId = randomUUID();
const now = new Date("2026-09-04T00:00:00Z");

const makeEvent = (overrides: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent => ({
  source: "google_calendar", ownership: "external",
  calendarId: "primary", externalEventId: "event-1", externalVersion: "v1", title: "수업",
  start: "2026-09-04T01:30:00.000Z", end: "2026-09-04T02:30:00.000Z", allDay: false,
  timeZone: "Asia/Seoul", recurringEventId: "series-1", originalStart: "2026-09-04T10:00:00+09:00",
  status: "confirmed", transparency: "opaque", visibility: "default", contentHash: "a".repeat(64),
  ...overrides
});

beforeAll(async () => {
  for (const id of [userA, userB]) {
    await sql`insert into auth.users(id,email,created_at,updated_at) values (${id},${`${id}@calendar.test`},now(),now())`;
    await sql`insert into public.profiles(id,timezone) values (${id},'Asia/Seoul')`;
  }
  await sql`insert into public.integration_accounts(id,user_id,provider,external_account_id,status,secret_ref,metadata,connected_at) values (${accountId},${userA},'google_calendar','calendar@example.test','active','test-secret',${sql.json({ calendar: { calendarId: "primary", syncToken: null } })},now())`;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userA},${userB})`;
  await sql.end();
});

describe("Supabase Google Calendar reconciliation", () => {
  it("creates, deduplicates, updates, tombstones, restores, and isolates fixed constraints", async () => {
    const repository = new SupabaseCalendarSyncRepository(sql);
    const account = await repository.getActiveAccount(userA) as CalendarIntegrationAccount;
    let pageEvents = [makeEvent()];
    let token = "sync-1";
    const client: GoogleCalendarClient = { listEvents: async () => ({ events: pageEvents, nextSyncToken: token }) };
    const service = new CalendarSyncService(client, repository, new FixedClock(now));

    expect(await service.sync(account)).toMatchObject({ mode: "full", active: 1, deleted: 0 });
    const persisted = await repository.getActiveAccount(userA);
    expect(persisted?.syncToken).toBe("sync-1");
    expect(await repository.listFixedTimeConstraints(userA, new Date("2026-09-04T00:00:00Z"), new Date("2026-09-05T00:00:00Z"))).toHaveLength(1);
    expect(await repository.listFixedTimeConstraints(userB, new Date("2026-09-04T00:00:00Z"), new Date("2026-09-05T00:00:00Z"))).toHaveLength(0);
    const initialOwnership = await sql<{ ownership: string }[]>`
      select ownership from public.external_references where user_id=${userA} and source='google_calendar'
    `;
    expect(initialOwnership[0]?.ownership).toBe("external");

    expect(await service.sync(account)).toMatchObject({ active: 0, deleted: 0 });
    let counts = await countsForUser(userA);
    expect(counts).toMatchObject({ references: 1, constraints: 1, inboxes: 1, commands: 1, events: 1 });

    pageEvents = [makeEvent({ externalVersion: "v2", title: "변경된 수업", start: "2026-09-04T03:00:00.000Z", end: "2026-09-04T04:00:00.000Z", contentHash: "b".repeat(64) })];
    token = "sync-2";
    const updatedAccount = { ...account, syncToken: "sync-1" };
    expect(await service.sync(updatedAccount)).toMatchObject({ mode: "incremental", active: 1 });
    const fixed = await repository.listFixedTimeConstraints(userA, new Date("2026-09-04T00:00:00Z"), new Date("2026-09-05T00:00:00Z"));
    expect(fixed[0]).toMatchObject({ title: "변경된 수업", start: new Date("2026-09-04T03:00:00.000Z") });

    pageEvents = [makeEvent({ externalVersion: "v3", status: "cancelled", contentHash: "c".repeat(64) })];
    token = "sync-3";
    expect(await service.sync({ ...account, syncToken: "sync-2" })).toMatchObject({ deleted: 1 });
    expect(await repository.listFixedTimeConstraints(userA, new Date("2026-09-04T00:00:00Z"), new Date("2026-09-05T00:00:00Z"))).toHaveLength(0);

    pageEvents = [makeEvent({ externalVersion: "v4", contentHash: "d".repeat(64) })];
    token = "sync-4";
    expect(await service.sync({ ...account, syncToken: "sync-3" })).toMatchObject({ active: 1 });
    expect(await repository.listFixedTimeConstraints(userA, new Date("2026-09-04T00:00:00Z"), new Date("2026-09-05T00:00:00Z"))).toHaveLength(1);

    await sql`update public.external_references set ownership='amber_managed' where user_id=${userA} and source='google_calendar'`;
    pageEvents = [makeEvent({ externalVersion: "v5", contentHash: "e".repeat(64) })];
    token = "sync-5";
    await service.sync({ ...account, syncToken: "sync-4" });
    expect(await repository.listFixedTimeConstraints(userA, new Date("2026-09-04T00:00:00Z"), new Date("2026-09-05T00:00:00Z"))).toHaveLength(0);
    const ownership = await sql<{ ownership: string; blocks: string }[]>`select r.ownership,c.value->>'blocksCapacity' blocks from public.external_references r join public.constraints c on c.id=r.internal_entity_id where r.user_id=${userA}`;
    expect(ownership[0]).toEqual({ ownership: "amber_managed", blocks: "false" });

    counts = await countsForUser(userA);
    expect(counts.references).toBe(1);

    pageEvents = [];
    token = "sync-6";
    expect(await service.sync({ ...account, syncToken: null })).toMatchObject({ mode: "full", deleted: 1 });
    const tombstone = await sql<{ sync_status: string; deleted_at: Date | null }[]>`
      select sync_status,deleted_at from public.external_references where user_id=${userA} and source='google_calendar'
    `;
    expect(tombstone[0]?.sync_status).toBe("deleted");
    expect(tombstone[0]?.deleted_at).toBeInstanceOf(Date);

    pageEvents = [makeEvent({
      externalEventId: "transparent-event",
      externalVersion: "transparent-v1",
      transparency: "transparent",
      contentHash: "f".repeat(64)
    })];
    token = "sync-7";
    expect(await service.sync({ ...account, syncToken: "sync-6" })).toMatchObject({ mode: "incremental", active: 1 });
    expect(await repository.listFixedTimeConstraints(userA, new Date("2026-09-04T00:00:00Z"), new Date("2026-09-05T00:00:00Z"))).toHaveLength(0);
    const transparent = await sql<{ ownership: string; blocks: string }[]>`
      select r.ownership,c.value->>'blocksCapacity' blocks
      from public.external_references r join public.constraints c on c.id=r.internal_entity_id
      where r.user_id=${userA} and r.external_id='primary:transparent-event'
    `;
    expect(transparent[0]).toEqual({ ownership: "external", blocks: "false" });
  });
});

async function countsForUser(userId: string) {
  const rows = await sql<{ references: number; constraints: number; inboxes: number; commands: number; events: number }[]>`
    select
      (select count(*)::int from public.external_references where user_id=${userId}) references,
      (select count(*)::int from public.constraints where user_id=${userId}) constraints,
      (select count(*)::int from public.inbox_items where user_id=${userId} and source='google_calendar') inboxes,
      (select count(*)::int from public.domain_commands where user_id=${userId} and command_type='RECONCILE_CALENDAR_EVENT') commands,
      (select count(*)::int from public.domain_events where user_id=${userId} and event_type='external_calendar_event_reconciled') events
  `;
  return rows[0]!;
}
