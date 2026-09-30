import { describe, expect, it } from "vitest";
import { calculateDailyCapacity, DAILY_LIFE_RESERVE_MINUTES, DAILY_SLEEP_RESERVE_MINUTES, DEFAULT_MAX_USABLE_DAILY_MINUTES, getDefaultDailyCapacityPolicy } from "./daily-capacity-policy.js";

const input = (overrides: Partial<Parameters<typeof calculateDailyCapacity>[0]> = {}) => ({
  planDate: "2026-09-26", timeZone: "Asia/Seoul", now: new Date("2026-09-26T09:00:00+09:00"),
  blockingIntervals: [], planningBufferMinutes: 15, ...overrides
});

describe("default daily capacity policy", () => {
  it("reserves eight hours for sleep and three hours for life", () => {
    expect(DAILY_SLEEP_RESERVE_MINUTES).toBe(480);
    expect(DAILY_LIFE_RESERVE_MINUTES).toBe(180);
    expect(DEFAULT_MAX_USABLE_DAILY_MINUTES).toBe(780);
    expect(getDefaultDailyCapacityPolicy("2026-09-26", "Asia/Seoul")).toMatchObject({
      wakeAt: new Date("2026-09-26T10:00:00+09:00"), softHorizon: new Date("2026-09-27T02:00:00+09:00"), maxUsableMinutes: 780
    });
  });

  it("subtracts future Calendar blockers once and preserves only the distinct planning buffer", () => {
    expect(calculateDailyCapacity(input({ blockingIntervals: [{ start: new Date("2026-09-26T11:00:00+09:00"), end: new Date("2026-09-26T12:00:00+09:00") }] }))).toMatchObject({
      blockedMinutes: 60, planningBufferMinutes: 15, availableMinutes: 705
    });
  });

  it("does not count elapsed time as future capacity", () => {
    expect(calculateDailyCapacity(input({ now: new Date("2026-09-26T20:00:00+09:00") }))).toMatchObject({
      elapsedMinutes: 600, availableMinutes: 165
    });
  });
});
