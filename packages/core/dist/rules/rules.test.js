import { describe, expect, it } from "vitest";
import { calculateCapacity } from "./capacity.js";
import { getDaysUntilDeadline, isDueToday, isDueWithin, isOverdue } from "./deadline.js";
import { getActualVsEstimatedRatio, getEstimateError, getRemainingMinutes } from "./duration.js";
import { calculateRecurringActivityRisk } from "./recurring-activity.js";
import { shouldReplan } from "./replan.js";
describe("deadline rules", () => {
    const now = new Date("2026-09-03T14:30:00.000Z");
    it("uses the user timezone for calendar-day boundaries", () => {
        const deadline = new Date("2026-09-04T00:30:00+09:00");
        expect(getDaysUntilDeadline(deadline, now, "Asia/Seoul")).toBe(1);
        expect(isDueToday(deadline, now, "Asia/Seoul")).toBe(false);
        expect(isDueWithin(deadline, 1, now, "Asia/Seoul")).toBe(true);
    });
    it("handles missing, overdue, and same-day deadlines", () => {
        expect(getDaysUntilDeadline(null, now, "Asia/Seoul")).toBeNull();
        expect(isOverdue(new Date("2026-09-03T14:29:59.000Z"), now)).toBe(true);
        expect(isDueToday(new Date("2026-09-03T14:45:00.000Z"), now, "Asia/Seoul")).toBe(true);
        expect(isDueWithin(new Date("2026-09-03T14:45:00.000Z"), -1, now, "Asia/Seoul")).toBe(false);
    });
});
describe("duration rules", () => {
    it("calculates remaining time without returning a negative value", () => {
        expect(getRemainingMinutes(60, 20)).toBe(40);
        expect(getRemainingMinutes(60, 80)).toBe(0);
        expect(getRemainingMinutes(null, 20)).toBeNull();
    });
    it("calculates signed estimate error and protects a zero denominator", () => {
        expect(getEstimateError(60, 90)).toBe(30);
        expect(getEstimateError(60, 30)).toBe(-30);
        expect(getActualVsEstimatedRatio(60, 90)).toBe(1.5);
        expect(getActualVsEstimatedRatio(0, 10)).toBeNull();
    });
});
describe("capacity rules", () => {
    it("reports zero capacity without overload", () => {
        expect(calculateCapacity({ availableMinutes: 100, plannedTaskMinutes: 70, protectedRoutineMinutes: 20, bufferMinutes: 10 }))
            .toEqual({ remainingCapacity: 0, overCapacity: false, overloadMinutes: 0 });
    });
    it("preserves negative remaining capacity and reports overload", () => {
        expect(calculateCapacity({ availableMinutes: 60, plannedTaskMinutes: 80, protectedRoutineMinutes: 10, bufferMinutes: 5 }))
            .toEqual({ remainingCapacity: -35, overCapacity: true, overloadMinutes: 35 });
    });
});
describe("RecurringActivity risk", () => {
    it.each([
        [3, 3, 0, 0, "LOW"],
        [3, 2, 2, 1, "LOW"],
        [3, 1, 2, 2, "MEDIUM"],
        [4, 1, 2, 3, "HIGH"],
        [1, 0, -1, 1, "HIGH"]
    ])("maps target=%i completed=%i days=%i", (targetCount, completedCount, remainingSuitableDays, remainingCount, risk) => {
        expect(calculateRecurringActivityRisk({ targetCount, completedCount, remainingSuitableDays })).toEqual({ remainingCount, risk });
    });
});
describe("replan trigger", () => {
    const baseline = {
        overCapacity: false,
        taskDurationOverrunMinutes: 10,
        durationOverrunThresholdMinutes: 10,
        importantDeadlineConflict: false,
        activePlanItemUnavailable: false
    };
    it("does not trigger at the threshold", () => expect(shouldReplan(baseline)).toBe(false));
    it.each([
        { ...baseline, overCapacity: true },
        { ...baseline, taskDurationOverrunMinutes: 11 },
        { ...baseline, importantDeadlineConflict: true },
        { ...baseline, activePlanItemUnavailable: true }
    ])("triggers when any deterministic condition is true", (input) => expect(shouldReplan(input)).toBe(true));
});
//# sourceMappingURL=rules.test.js.map