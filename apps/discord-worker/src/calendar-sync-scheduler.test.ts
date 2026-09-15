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
      { provider: "snowboard", sync: async () => { throw new Error("provider unavailable"); } },
      { provider: "icloud_calendar", sync: second }
    ];

    await expect(new CalendarSyncScheduler(tasks, 900_000).runOnce()).resolves.toEqual([
      { provider: "snowboard", status: "failed" },
      { provider: "icloud_calendar", status: "synced" }
    ]);
    expect(second).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith("Calendar sync iteration failed: provider=snowboard");
    error.mockRestore();
  });

  it("runs Snowboard at startup and every configured interval without duplicate timers", async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => ({ received: 3 }));
    const scheduler = new CalendarSyncScheduler([{ provider: "snowboard", sync }], 900_000);

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(900_000);
    expect(sync).toHaveBeenCalledTimes(2);
    scheduler.stop();
    vi.useRealTimers();
  });

  it("does not overlap a slow Snowboard sync with the next interval", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const sync = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const scheduler = new CalendarSyncScheduler([{ provider: "snowboard", sync }], 900_000);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(900_000);
    expect(sync).toHaveBeenCalledOnce();

    finish?.();
    await Promise.resolve();
    scheduler.stop();
    vi.useRealTimers();
  });
});
