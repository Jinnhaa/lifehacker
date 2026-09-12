import { describe, expect, it, vi } from "vitest";
import { CalendarSyncScheduler, type CalendarSyncTask } from "./calendar-sync-scheduler.js";

describe("CalendarSyncScheduler", () => {
  it("safely no-ops when no provider has an active account", async () => {
    const scheduler = new CalendarSyncScheduler([
      { provider: "google_calendar", sync: async () => null },
      { provider: "icloud_calendar", sync: async () => null }
    ], 900_000);

    await expect(scheduler.runOnce()).resolves.toEqual([
      { provider: "google_calendar", status: "no_active_account" },
      { provider: "icloud_calendar", status: "no_active_account" }
    ]);
  });

  it("isolates one provider failure and continues the remaining sync tasks", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const second = vi.fn(async () => ({ received: 0 }));
    const tasks: CalendarSyncTask[] = [
      { provider: "google_calendar", sync: async () => { throw new Error("provider unavailable"); } },
      { provider: "icloud_calendar", sync: second }
    ];

    await expect(new CalendarSyncScheduler(tasks, 900_000).runOnce()).resolves.toEqual([
      { provider: "google_calendar", status: "failed" },
      { provider: "icloud_calendar", status: "synced" }
    ]);
    expect(second).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith("Calendar sync iteration failed: provider=google_calendar");
    error.mockRestore();
  });
});
