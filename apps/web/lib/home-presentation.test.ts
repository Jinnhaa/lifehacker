import { describe, expect, it } from "vitest";
import { activeHomeQuests, remainingAvailableMinutes, splitTodayPlan } from "./home-presentation";
import type { HomeTimelineItem } from "./home-types";

const item = (id: string, overrides: Partial<HomeTimelineItem> = {}): HomeTimelineItem => ({
  id, taskId: id, kind: "task", title: id, startsAt: "2026-09-19T03:00:00Z", endsAt: "2026-09-19T03:30:00Z",
  minutes: 30, status: "planned", context: null, current: false, source: "chief", ...overrides
});

describe("Home execution presentation", () => {
  it("keeps only active approved next quests, excluding the current task", () => {
    expect(activeHomeQuests([
      item("current"), item("next"), item("routine", { kind: "routine", taskId: null, occurrenceId: "occurrence" }), item("done", { status: "completed" }), item("pending", { source: "pending" })
    ], "current").map((entry) => entry.id)).toEqual(["next", "routine"]);
  });
  it("shows flexible quests by order and calendar entries as fixed schedule", () => {
    const base = { taskId: "task", stepId: null, occurrenceId: null, title: "학습", context: null, startsAt: "2026-09-19T03:00:00Z", endsAt: "2026-09-19T03:30:00Z", minutes: 30, current: false };
    const result = splitTodayPlan([{ ...base, id: "task", itemType: "study" }, { ...base, id: "event", itemType: "calendar" }]);
    expect(result.quests.map((entry) => entry.id)).toEqual(["task"]);
    expect(result.fixed.map((entry) => entry.id)).toEqual(["event"]);
  });
  it("counts only remaining free time and merges overlapping blocks", () => {
    const now = new Date("2026-09-19T03:00:00Z");
    const snapshot = { workUntil: "2026-09-19T05:00:00Z", fixedEvents: [
      { start: "2026-09-19T03:30:00Z", end: "2026-09-19T04:00:00Z", blocksCapacity: true },
      { start: "2026-09-19T03:45:00Z", end: "2026-09-19T04:15:00Z", blocksCapacity: true }
    ] };
    expect(remainingAvailableMinutes(snapshot, now, [])).toBe(75);
  });
});
