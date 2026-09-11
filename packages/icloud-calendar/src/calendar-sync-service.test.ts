import { FixedClock, type NormalizedCalendarEvent } from "@amber/shared";
import { describe, expect, it } from "vitest";
import type { ApplyICloudCollectionSyncInput, FixedTimeConstraint, ICloudCalendarSyncRepository } from "./calendar-sync-repository.js";
import { ICloudCalendarSyncService } from "./calendar-sync-service.js";
import type { ICloudCalDavReader, ICloudCalendarAccount, ICloudCalendarCollection, ICloudDiscovery } from "./contracts.js";

const collection: ICloudCalendarCollection = { id: "calendar-1", name: "개인", ctag: "new", syncToken: "sync-new", timeZone: "Asia/Seoul" };
const event: NormalizedCalendarEvent = {
  source: "icloud_calendar", ownership: "external",
  calendarId: collection.id, externalEventId: "event-1", externalVersion: "v1", title: "일정",
  start: "2026-09-04T01:00:00.000Z", end: "2026-09-04T02:00:00.000Z", allDay: false,
  timeZone: "Asia/Seoul", recurringEventId: null, originalStart: null, status: "confirmed",
  transparency: "opaque", visibility: null, contentHash: "a".repeat(64)
};
const discovery: ICloudDiscovery = { principalUrl: "principal", calendarHomeUrl: "home", collections: [collection] };

class FakeReader implements ICloudCalDavReader {
  fetches = 0;
  constructor(readonly value: ICloudDiscovery = discovery) {}
  async discover() { return this.value; }
  async fetchCollection(value: ICloudCalendarCollection) { this.fetches += 1; return { collection: value, events: [event] }; }
}

class FakeRepository implements ICloudCalendarSyncRepository {
  applied: ApplyICloudCollectionSyncInput[] = [];
  saved = 0;
  async getActiveAccount(): Promise<ICloudCalendarAccount | null> { return null; }
  async applyCollectionSync(input: ApplyICloudCollectionSyncInput) { this.applied.push(input); return { active: input.events.length, deleted: input.events.length === 0 ? 1 : 0 }; }
  async saveDiscovery() { this.saved += 1; }
  async listFixedTimeConstraints(): Promise<readonly FixedTimeConstraint[]> { return []; }
}

const account = (metadata: Record<string, unknown> = {}): ICloudCalendarAccount => ({
  id: "account", userId: "user", externalAccountId: "apple", secretRef: "env:ICLOUD_APP_PASSWORD", metadata
});

describe("ICloudCalendarSyncService", () => {
  it("runs a bounded 7-day/90-day initial sync", async () => {
    const reader = new FakeReader();
    const repository = new FakeRepository();
    const result = await new ICloudCalendarSyncService(reader, repository, new FixedClock(new Date("2026-09-04T00:00:00Z"))).sync(account());
    expect(result).toMatchObject({ discoveredCalendars: 1, fetchedCalendars: 1, received: 1, active: 1 });
    expect(repository.applied[0]?.window).toEqual({ start: new Date("2026-08-28T00:00:00Z"), end: new Date("2026-12-03T00:00:00Z") });
    expect(repository.saved).toBe(1);
  });

  it("skips an unchanged collection by CTag", async () => {
    const reader = new FakeReader();
    const repository = new FakeRepository();
    const metadata = { caldav: { collections: { "calendar-1": { name: "개인", ctag: "new", syncToken: "old" } } } };
    const result = await new ICloudCalendarSyncService(reader, repository, new FixedClock(new Date())).sync(account(metadata));
    expect(result).toMatchObject({ fetchedCalendars: 0, skippedCalendars: 1, received: 0 });
    expect(reader.fetches).toBe(0);
  });

  it("tombstones events from a calendar collection that disappeared", async () => {
    const reader = new FakeReader({ ...discovery, collections: [] });
    const repository = new FakeRepository();
    const metadata = { caldav: { collections: { removed: { name: "삭제됨", ctag: "old", syncToken: "old" } } } };
    const result = await new ICloudCalendarSyncService(reader, repository, new FixedClock(new Date())).sync(account(metadata));
    expect(result.deleted).toBe(1);
    expect(repository.applied[0]?.collection.id).toBe("removed");
    expect(repository.applied[0]?.events).toEqual([]);
    expect(repository.applied[0]?.collectionRemoved).toBe(true);
  });

  it("does not alter persisted constraints when provider discovery fails", async () => {
    const repository = new FakeRepository();
    const reader: ICloudCalDavReader = {
      discover: async () => { throw new Error("provider unavailable"); },
      fetchCollection: async () => { throw new Error("unexpected fetch"); }
    };
    await expect(new ICloudCalendarSyncService(reader, repository, new FixedClock(new Date())).sync(account())).rejects.toThrow("provider unavailable");
    expect(repository.applied).toEqual([]);
    expect(repository.saved).toBe(0);
  });
});
