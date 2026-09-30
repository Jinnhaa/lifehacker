import { describe, expect, it } from "vitest";
import { LOCAL_SUPABASE_DATABASE_URL, loadSyncWorkerConfig } from "./config.js";

describe("Sync worker config", () => {
  it("does not require Discord credentials", () => {
    expect(loadSyncWorkerConfig({
      AMBER_USER_ID: "11111111-1111-4111-8111-111111111111"
    })).toEqual({
      databaseUrl: LOCAL_SUPABASE_DATABASE_URL,
      userId: "11111111-1111-4111-8111-111111111111",
      calendarSyncIntervalMs: 900_000,
      snowboardSyncIntervalMs: 900_000
    });
  });

  it("accepts bounded provider sync intervals", () => {
    expect(loadSyncWorkerConfig({
      CALENDAR_SYNC_INTERVAL_MS: "60000",
      SNOWBOARD_SYNC_INTERVAL_MS: "60000"
    })).toMatchObject({
      calendarSyncIntervalMs: 60_000,
      snowboardSyncIntervalMs: 60_000
    });
  });
});
