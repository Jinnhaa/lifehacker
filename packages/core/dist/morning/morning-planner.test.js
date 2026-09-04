import { describe, expect, it } from "vitest";
import { createMorningPlan } from "./morning-planner.js";
const userId = "10000000-0000-4000-8000-000000000001";
const task = (overrides = {}) => ({
    id: "20000000-0000-4000-8000-000000000001",
    userId, workContextId: null, objectiveId: null, title: "오늘 마감 과제", description: null,
    executionMode: "standard", officialDeadline: new Date("2026-09-04T14:59:59.000Z"), internalDeadline: null,
    estimatedMinutes: 180, estimatedUserMinutes: null, actualMinutes: 0, importance: 4, status: "INBOX",
    nextAction: null, completionCriteria: null, completionSource: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"), completedAt: null, updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides
});
const observation = (overrides = {}) => ({
    timeZone: "Asia/Seoul", planningBufferMinutes: 30, planningPolicy: {},
    tasks: [task()], strategicDirectives: [],
    constraints: [{
            id: "constraint-1", title: "수업", start: new Date("2026-09-04T01:00:00.000Z"),
            end: new Date("2026-09-04T02:30:00.000Z"), blocksCapacity: true,
            constraintType: "availability", hardness: "hard", origin: "google_calendar"
        }],
    recurringActivities: [{
            id: "routine-1", title: "일본어", targetCount: 3, completedCount: 1,
            expectedMinutes: 30, minimumMinutes: 20, preferredDays: [1, 3, 5], importance: 4, occurrenceId: null
        }],
    ...overrides
});
describe("createMorningPlan", () => {
    it("protects fixed events, buffer, and MEDIUM/HIGH recurring activity without overload", () => {
        const plan = createMorningPlan({
            observation: observation(),
            now: new Date("2026-09-04T00:00:00.000Z"),
            workUntil: new Date("2026-09-04T06:00:00.000Z"),
            privateIntervals: [], localWeekday: 5
        });
        expect(plan.items.some((item) => item.itemType === "routine" && item.title === "일본어")).toBe(true);
        expect(plan.items.some((item) => item.itemType === "buffer" && item.plannedMinutes === 30)).toBe(true);
        for (const item of plan.items) {
            expect(item.end <= new Date("2026-09-04T06:00:00.000Z")).toBe(true);
            expect(item.end <= new Date("2026-09-04T01:00:00.000Z") || item.start >= new Date("2026-09-04T02:30:00.000Z")).toBe(true);
        }
        const planned = plan.items.reduce((sum, item) => sum + item.plannedMinutes, 0);
        expect(planned).toBeLessThanOrEqual(270);
    });
    it("never schedules beyond work-until and leaves unestimated work unscheduled", () => {
        const plan = createMorningPlan({
            observation: observation({ constraints: [], planningBufferMinutes: 0, tasks: [task({ estimatedMinutes: null })], recurringActivities: [] }),
            now: new Date("2026-09-04T00:00:00.000Z"), workUntil: new Date("2026-09-04T01:00:00.000Z"),
            privateIntervals: [], localWeekday: 5
        });
        expect(plan.items).toEqual([]);
    });
});
//# sourceMappingURL=morning-planner.test.js.map