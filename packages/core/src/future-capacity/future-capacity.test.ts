import type { TaskId } from "@amber/shared";
import { describe, expect, it } from "vitest";
import { projectCapacityWindow, projectFutureCapacity, type FutureCapacityInput, type FutureCapacityTask } from "./future-capacity.js";

const instant = (time: string) => new Date(time);
const interval = (start: string, end: string) => ({ start: instant(start), end: instant(end) });
const work = interval("2026-09-26T09:00:00+09:00", "2026-09-26T17:00:00+09:00");
const task = (overrides: Partial<FutureCapacityTask> = {}): FutureCapacityTask => ({
  id: "task-1" as TaskId, status: "PLANNED", plannedDate: "2026-09-26", internalDeadline: null, officialDeadline: null,
  estimatedUserMinutes: null, estimatedMinutes: 120, actualMinutes: 0, ...overrides
});
const input = (overrides: Partial<FutureCapacityInput> = {}): FutureCapacityInput => ({
  startDate: "2026-09-26", endDate: "2026-09-26", timeZone: "Asia/Seoul", now: instant("2026-09-26T09:00:00+09:00"),
  dailyAvailability: { "2026-09-26": [work] }, constraints: [], planningBufferMinutes: 30, tasks: [], ...overrides
});
const day = (overrides: Partial<FutureCapacityInput> = {}) => projectFutureCapacity(input(overrides)).days[0]!;
const block = (start: string, end: string, blocksCapacity = true) => ({ ...interval(start, end), blocksCapacity });

describe("Future Capacity projection", () => {
  it("subtracts fixed commitments and the existing planning buffer", () => {
    expect(day({ constraints: [block("2026-09-26T10:00:00+09:00", "2026-09-26T11:00:00+09:00")] })).toMatchObject({ grossCapacityMinutes: 480, blockedMinutes: 60, bufferMinutes: 30, availableMinutes: 390 });
  });
  it("unions overlapping fixed commitments rather than double counting", () => {
    expect(day({ constraints: [block("2026-09-26T10:00:00+09:00", "2026-09-26T12:00:00+09:00"), block("2026-09-26T11:00:00+09:00", "2026-09-26T13:00:00+09:00")] }).blockedMinutes).toBe(180);
  });
  it("ignores non-capacity-blocking intervals", () => {
    expect(day({ constraints: [block("2026-09-26T09:00:00+09:00", "2026-09-26T17:00:00+09:00", false)] }).blockedMinutes).toBe(0);
  });
  it("divides crossing-midnight intervals by local date", () => {
    const overnight = interval("2026-09-26T22:00:00+09:00", "2026-09-27T02:00:00+09:00");
    const projection = projectFutureCapacity(input({ endDate: "2026-09-27", dailyAvailability: { "2026-09-26": [overnight], "2026-09-27": [overnight] }, constraints: [block("2026-09-26T23:00:00+09:00", "2026-09-27T01:30:00+09:00")] }));
    expect(projection.days.map((value) => [value.grossCapacityMinutes, value.blockedMinutes])).toEqual([[120, 60], [120, 90]]);
  });
  it("excludes today's elapsed free time and past commitments, clipping active commitments", () => {
    expect(day({ now: instant("2026-09-26T12:00:00+09:00"), constraints: [block("2026-09-26T09:00:00+09:00", "2026-09-26T10:00:00+09:00"), block("2026-09-26T11:00:00+09:00", "2026-09-26T13:00:00+09:00")] })).toMatchObject({ grossCapacityMinutes: 300, blockedMinutes: 60, availableMinutes: 210 });
  });
  it("uses caller-configured future availability without a default lifestyle schedule", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-27", dailyAvailability: { "2026-09-27": [interval("2026-09-27T14:00:00+09:00", "2026-09-27T16:00:00+09:00")] } }));
    expect(projection.days[1]).toMatchObject({ grossCapacityMinutes: 120, availableMinutes: 90 });
  });
  it("keeps missing/null future availability unknown", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-28", dailyAvailability: { "2026-09-27": null } }));
    expect(projection.days.every((value) => value.availableMinutes === null)).toBe(true);
  });
  it("distinguishes known no-work availability from unknown availability", () => {
    expect(day({ dailyAvailability: { "2026-09-26": [] } })).toMatchObject({ grossCapacityMinutes: 0, bufferMinutes: 0, availableMinutes: 0 });
  });
  it("counts explicit planned workload against its date", () => {
    expect(day({ tasks: [task()] })).toMatchObject({ committedWorkMinutes: 120, remainingMinutes: 330 });
  });
  it("uses user estimates first and the canonical actual-time workload subtraction", () => {
    expect(day({ tasks: [task({ estimatedUserMinutes: 90, actualMinutes: 30 })] }).committedWorkMinutes).toBe(60);
  });
  it.each(["INBOX", "IN_PROGRESS", "BLOCKED", "WAITING_FOR_USER"] as const)("retains unfinished %s work as demand", (status) => {
    expect(day({ tasks: [task({ status })] }).committedWorkMinutes).toBe(120);
  });
  it("excludes completed work even with remaining estimate", () => {
    const projection = projectFutureCapacity(input({ tasks: [task({ status: "DONE" })] }));
    expect(projection.workload).toEqual([]);
    expect(projection.days[0]!.committedWorkMinutes).toBe(0);
  });
  it("reports no-estimate work as unknown, not zero-cost free capacity", () => {
    const projection = projectFutureCapacity(input({ tasks: [task({ estimatedMinutes: null, actualMinutes: 60 })] }));
    expect(projection.workload[0]!.remainingMinutes).toBeNull();
    expect(projection.days[0]).toMatchObject({ unknownEffortTaskIds: ["task-1"], remainingMinutes: null });
    expect(projectCapacityWindow(projection, "2026-09-26", "2026-09-26").slackMinutes).toBeNull();
  });
  it("reports positive deadline-window slack without scheduling unplanned deadline work", () => {
    const projection = projectFutureCapacity(input({ tasks: [task({ plannedDate: null, officialDeadline: instant("2026-09-26T23:00:00+09:00") })] }));
    expect(projection.days[0]!.committedWorkMinutes).toBe(0);
    expect(projection.deadlineWindows[0]).toMatchObject({ availableMinutes: 450, knownRequiredWorkMinutes: 120, slackMinutes: 330 });
  });
  it("reports negative deadline-window slack", () => {
    const projection = projectFutureCapacity(input({ tasks: [task({ estimatedMinutes: 600, internalDeadline: instant("2026-09-26T23:00:00+09:00") })] }));
    expect(projection.deadlineWindows[0]!.slackMinutes).toBe(-150);
    expect(projection.deadlineWindows[0]!.requiredTaskIds).toEqual(["task-1"]);
  });
  it("does not report positive slack with unknown capacity", () => {
    const projection = projectFutureCapacity(input({ dailyAvailability: {}, tasks: [task()] }));
    expect(projectCapacityWindow(projection, "2026-09-26", "2026-09-26")).toMatchObject({ availableMinutes: null, slackMinutes: null, unknownCapacityDates: ["2026-09-26"] });
  });
  it("uses local deadline dates across UTC boundaries", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-27", tasks: [task({ plannedDate: null, officialDeadline: instant("2026-09-26T16:00:00Z") })] }));
    expect(projection.workload[0]!.deadlineDate).toBe("2026-09-27");
    expect(projection.deadlineWindows[0]!.endDate).toBe("2026-09-27");
  });
  it("does not consume semantic Goal progress or mutate source evidence", () => {
    const source = { ...input({ tasks: [task()] }), goalProgress: 0.9 };
    const before = structuredClone(source);
    expect(projectFutureCapacity(source)).toEqual(projectFutureCapacity({ ...source, goalProgress: undefined } as FutureCapacityInput));
    expect(source).toEqual(before);
  });
  it("uses an earlier internal deadline and retains official fallback", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-30", tasks: [task({ plannedDate: null, internalDeadline: instant("2026-09-27T23:00:00+09:00"), officialDeadline: instant("2026-09-29T23:00:00+09:00") })] }));
    expect(projection.workload[0]).toMatchObject({ deadlineDate: "2026-09-27", deadlineSource: "internal" });
  });
  it("does not hide an earlier official deadline behind a later plan/internal deadline", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-30", tasks: [task({ plannedDate: "2026-09-30", internalDeadline: instant("2026-09-30T23:00:00+09:00"), officialDeadline: instant("2026-09-26T23:00:00+09:00") })] }));
    expect(projection.deadlineWindows[0]!.knownRequiredWorkMinutes).toBe(120);
    expect(projection.workload[0]!.deadlineSource).toBe("official");
  });
  it("retains unfinished past placements/deadlines as carryover pressure in later windows", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-27", tasks: [task({ plannedDate: "2026-09-25", officialDeadline: instant("2026-09-25T23:00:00+09:00") })] }));
    expect(projectCapacityWindow(projection, "2026-09-27", "2026-09-27").knownRequiredWorkMinutes).toBe(120);
  });
  it("exposes unplaced demand and avoids an unsupported positive slack claim", () => {
    const projection = projectFutureCapacity(input({ tasks: [task({ plannedDate: null })] }));
    expect(projectCapacityWindow(projection, "2026-09-26", "2026-09-26")).toMatchObject({ unplacedTaskIds: ["task-1"], slackMinutes: null });
  });
  it("preserves unknown effort IDs even when demand has no date placement", () => {
    const projection = projectFutureCapacity(input({ tasks: [task({ plannedDate: null, estimatedMinutes: null })] }));
    expect(projectCapacityWindow(projection, "2026-09-26", "2026-09-26")).toMatchObject({ unknownEffortTaskIds: ["task-1"], unplacedTaskIds: ["task-1"], slackMinutes: null });
  });
  it("sums multi-day capacity and counts planned/deadline demand once", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-27", dailyAvailability: { "2026-09-26": [work], "2026-09-27": [interval("2026-09-27T09:00:00+09:00", "2026-09-27T11:00:00+09:00")] }, tasks: [task({ officialDeadline: instant("2026-09-27T23:00:00+09:00") })] }));
    expect(projection.deadlineWindows[0]).toMatchObject({ availableMinutes: 540, knownRequiredWorkMinutes: 120, slackMinutes: 420 });
  });
  it("does not claim known capacity when only part of the window is known", () => {
    const projection = projectFutureCapacity(input({ endDate: "2026-09-27", tasks: [task({ plannedDate: null, officialDeadline: instant("2026-09-27T23:00:00+09:00") })] }));
    expect(projection.deadlineWindows[0]).toMatchObject({ availableMinutes: null, slackMinutes: null, knownRequiredWorkMinutes: 120, unknownCapacityDates: ["2026-09-27"] });
  });
  it("clamps buffer to usable capacity when commitments fill the day", () => {
    expect(day({ constraints: [block("2026-09-26T09:00:00+09:00", "2026-09-26T17:00:00+09:00")] })).toMatchObject({ blockedMinutes: 480, bufferMinutes: 0, availableMinutes: 0 });
  });
  it("unions overlapping availability and clips blockers to actual work windows", () => {
    expect(day({ dailyAvailability: { "2026-09-26": [work, work] }, constraints: [block("2026-09-26T16:00:00+09:00", "2026-09-26T20:00:00+09:00")] })).toMatchObject({ grossCapacityMinutes: 480, blockedMinutes: 60 });
  });
  it("uses actual timezone day boundaries on a DST transition", () => {
    const window = interval("2026-03-08T00:00:00-05:00", "2026-03-09T00:00:00-04:00");
    expect(day({ startDate: "2026-03-08", endDate: "2026-03-08", timeZone: "America/New_York", now: window.start, dailyAvailability: { "2026-03-08": [window] }, planningBufferMinutes: 0 }).grossCapacityMinutes).toBe(23 * 60);
  });
  it("rejects invalid dates, reversed windows and invalid effort instead of false evidence", () => {
    expect(() => projectFutureCapacity(input({ startDate: "2026-02-30" }))).toThrow();
    expect(() => projectFutureCapacity(input({ endDate: "2026-09-25" }))).toThrow();
    expect(() => projectFutureCapacity(input({ tasks: [task({ actualMinutes: -1 })] }))).toThrow();
    const projection = projectFutureCapacity(input());
    expect(() => projectCapacityWindow(projection, "2026-09-26", "2026-09-27")).toThrow();
  });
});
