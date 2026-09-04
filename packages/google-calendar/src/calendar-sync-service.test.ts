import { FixedClock } from "@amber/shared";
import { describe, expect, it } from "vitest";
import type { ApplyCalendarSyncInput, CalendarSyncRepository, FixedTimeConstraint } from "./calendar-sync-repository.js";
import { CalendarSyncService } from "./calendar-sync-service.js";
import { CalendarSyncTokenExpiredError, type CalendarIntegrationAccount, type CalendarPage, type GoogleCalendarClient, type NormalizedCalendarEvent } from "./contracts.js";

const account = (syncToken: string | null = null): CalendarIntegrationAccount => ({
  id: "account", userId: "user", calendarId: "primary", secretRef: "secret", syncToken, metadata: {}
});

const event = (id: string): NormalizedCalendarEvent => ({
  calendarId: "primary", externalEventId: id, externalVersion: `v-${id}`, title: id,
  start: "2026-09-04T01:00:00.000Z", end: "2026-09-04T02:00:00.000Z",
  allDay: false, timeZone: "Asia/Seoul", recurringEventId: null, originalStart: null,
  status: "confirmed", transparency: "opaque", visibility: null, contentHash: id.padEnd(64, "0").slice(0, 64)
});

class FakeRepository implements CalendarSyncRepository {
  applied: ApplyCalendarSyncInput[] = [];
  async getActiveAccount(): Promise<CalendarIntegrationAccount | null> { return null; }
  async applySync(input: ApplyCalendarSyncInput) { this.applied.push(input); return { active: input.events.length, deleted: 0 }; }
  async listFixedTimeConstraints(): Promise<readonly FixedTimeConstraint[]> { return []; }
}

describe("CalendarSyncService", () => {
  it("runs a bounded initial full sync through every page and persists the final token", async () => {
    const requests: Parameters<GoogleCalendarClient["listEvents"]>[0][] = [];
    const client: GoogleCalendarClient = { listEvents: async (request) => {
      requests.push(request);
      return request.pageToken ? { events: [event("second")], nextSyncToken: "sync-1" } : { events: [event("first")], nextPageToken: "page-2" };
    } };
    const repository = new FakeRepository();
    const result = await new CalendarSyncService(client, repository, new FixedClock(new Date("2026-09-04T00:00:00Z"))).sync(account());
    expect(result).toMatchObject({ mode: "full", received: 2, nextSyncToken: "sync-1" });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ calendarId: "primary", timeMin: "2026-08-28T00:00:00.000Z", timeMax: "2026-12-03T00:00:00.000Z" });
    expect(requests[1]?.pageToken).toBe("page-2");
    expect(repository.applied[0]?.fullSync).toBe(true);
  });

  it("uses only syncToken for incremental sync", async () => {
    const requests: Parameters<GoogleCalendarClient["listEvents"]>[0][] = [];
    const client: GoogleCalendarClient = { listEvents: async (request) => { requests.push(request); return { events: [], nextSyncToken: "sync-2" }; } };
    const result = await new CalendarSyncService(client, new FakeRepository(), new FixedClock(new Date())).sync(account("sync-1"));
    expect(result.mode).toBe("incremental");
    expect(requests[0]).toEqual({ calendarId: "primary", syncToken: "sync-1" });
  });

  it("recovers once from an invalid sync token with a safe full sync", async () => {
    const requests: Parameters<GoogleCalendarClient["listEvents"]>[0][] = [];
    const pages: CalendarPage[] = [{ events: [event("recovered")], nextSyncToken: "sync-new" }];
    const client: GoogleCalendarClient = { listEvents: async (request) => {
      requests.push(request);
      if (request.syncToken) throw new CalendarSyncTokenExpiredError();
      return pages[0]!;
    } };
    const result = await new CalendarSyncService(client, new FakeRepository(), new FixedClock(new Date("2026-09-04T00:00:00Z"))).sync(account("expired"));
    expect(result.mode).toBe("full_after_token_expiry");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.syncToken).toBeUndefined();
    expect(requests[1]?.timeMin).toBeDefined();
  });
});
