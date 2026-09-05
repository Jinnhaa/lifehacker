import type { TaskId, UserId } from "@amber/shared";
import { describe, expect, it } from "vitest";
import type { MorningObservation } from "../morning/morning.js";
import type { Task } from "../task/task.js";
import { classifyReplanImpact } from "./replan-impact.js";
import { buildReplanDraft } from "./replan-planner.js";
import type { ReplanPlanState } from "./replan.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const now = new Date("2026-09-04T03:00:00.000Z");
const task = (id: string, title: string, overrides: Partial<Task> = {}): Task => ({
  id: id as TaskId, userId, workContextId: null, objectiveId: null, title, description: null,
  executionMode: "standard", officialDeadline: null, internalDeadline: null, estimatedMinutes: 60,
  estimatedUserMinutes: null, actualMinutes: 0, importance: 3, status: "PLANNED", nextAction: null,
  completionCriteria: null, completionSource: null, createdAt: now, completedAt: null, updatedAt: now,
  ...overrides
});
const first = task("20000000-0000-4000-8000-000000000001", "첫 작업");
const blocked = task("20000000-0000-4000-8000-000000000002", "막힌 작업", { status: "BLOCKED", importance: 5 });
const observation: MorningObservation = {
  timeZone: "Asia/Seoul", planningBufferMinutes: 15, planningPolicy: {}, tasks: [first, blocked], strategicDirectives: [],
  constraints: [{
    id: "fixed", title: "수업", start: new Date("2026-09-04T04:00:00.000Z"), end: new Date("2026-09-04T05:00:00.000Z"),
    blocksCapacity: true, constraintType: "fixed_event", hardness: "hard", origin: "calendar"
  }],
  recurringActivities: [{
    id: "routine", title: "일본어", targetCount: 2, completedCount: 0, expectedMinutes: 30,
    minimumMinutes: 20, preferredDays: [5], importance: 4, occurrenceId: null
  }]
};
const previous: ReplanPlanState = {
  planId: "30000000-0000-4000-8000-000000000001", revisionNo: 1, planDate: "2026-09-04", timeZone: "Asia/Seoul",
  workUntil: new Date("2026-09-04T07:00:00.000Z"), privateIntervals: [], activeTaskId: null,
  items: [
    { id: "i1", itemType: "task", taskId: first.id, title: first.title, start: now, end: new Date("2026-09-04T04:00:00.000Z"), plannedMinutes: 60, status: "planned", taskStatus: "PLANNED", taskImportance: 3, taskDeadline: null },
    { id: "i2", itemType: "task", taskId: blocked.id, title: blocked.title, start: new Date("2026-09-04T05:00:00.000Z"), end: new Date("2026-09-04T06:00:00.000Z"), plannedMinutes: 60, status: "blocked", taskStatus: "BLOCKED", taskImportance: 5, taskDeadline: null },
    { id: "i3", itemType: "rest", title: "휴식", start: new Date("2026-09-04T06:00:00.000Z"), end: new Date("2026-09-04T06:15:00.000Z"), plannedMinutes: 15, status: "planned", taskStatus: null, taskImportance: null, taskDeadline: null },
    { id: "i4", itemType: "buffer", title: "버퍼", start: new Date("2026-09-04T06:15:00.000Z"), end: new Date("2026-09-04T06:30:00.000Z"), plannedMinutes: 15, status: "planned", taskStatus: null, taskImportance: null, taskDeadline: null }
  ]
};

describe("Dynamic replanning deterministic planner", () => {
  it("reobserves while protecting fixed time, rest, buffer, work-until, and routine risk", () => {
    const draft = buildReplanDraft({ observation, previous, now });
    expect(draft.items.some((item) => item.taskId === blocked.id)).toBe(false);
    expect(draft.items.some((item) => item.itemType === "routine")).toBe(true);
    expect(draft.items.some((item) => item.itemType === "rest" && item.plannedMinutes === 15)).toBe(true);
    expect(draft.items.some((item) => item.itemType === "buffer" && item.plannedMinutes === 15)).toBe(true);
    expect(draft.items.every((item) => item.end <= previous.workUntil)).toBe(true);
    expect(draft.items.every((item) => item.end <= observation.constraints[0]!.start || item.start >= observation.constraints[0]!.end)).toBe(true);
    expect(draft.items.filter((item) => item.itemType === "task" || item.itemType === "routine")
      .reduce((sum, item) => sum + item.plannedMinutes, 0)).toBeLessThanOrEqual(60);
  });

  it("classifies routine removal and active focus removal as important", () => {
    const draft = buildReplanDraft({ observation, previous, now });
    const withoutProtected = { ...draft, items: draft.items.filter((item) => item.itemType !== "routine" && item.taskId !== first.id) };
    const decision = classifyReplanImpact({ ...previous, activeTaskId: first.id }, withoutProtected, observation, 5);
    expect(decision.impact).toBe("IMPORTANT_CHANGE");
    expect(decision.reasons).toEqual(expect.arrayContaining(["active_focus_task_removed", "protected_routine_removed"]));
  });

  it("classifies order/time-only adjustment as small", () => {
    const draft = buildReplanDraft({ observation, previous, now });
    expect(classifyReplanImpact(previous, draft, observation, 5).impact).toBe("SMALL_CHANGE");
  });

  it("keeps an active Focus task even when its recorded estimate is exhausted", () => {
    const exhausted = { ...first, actualMinutes: 60 };
    const draft = buildReplanDraft({
      observation: { ...observation, tasks: [exhausted] },
      previous: { ...previous, activeTaskId: first.id },
      now
    });
    expect(draft.items.some((item) => item.taskId === first.id)).toBe(true);
  });

  it("uses the latest configured work-until instead of the Morning snapshot", () => {
    const draft = buildReplanDraft({
      observation: { ...observation, planningPolicy: { defaultWorkUntil: "13:00" } },
      previous,
      now
    });
    expect(draft.items.every((item) => item.end <= new Date("2026-09-04T04:00:00.000Z"))).toBe(true);
  });

  it("uses the same approved preference and requires approval if a protected routine falls out", () => {
    const principled: MorningObservation = {
      ...observation,
      tasks: [{ ...first, officialDeadline: new Date("2026-09-06T14:59:59.000Z") }],
      principles: [{
        id: "principle", statement: "마감이 가까운 일을 우선한다", origin: "pattern_observed",
        decisionType: "important_replan", situationType: "deadline_risk_increased", choiceAction: "approve",
        consistencyKind: "reason", consistencyValue: "deadline_priority",
        applicationPolicy: "deadline_over_routine"
      }]
    };
    const draft = buildReplanDraft({ observation: principled, previous, now });
    expect(draft.inputSnapshot.usedPrincipleIds).toEqual(["principle"]);
    expect(draft.items.some((item) => item.taskId === first.id)).toBe(true);
    expect(draft.items.some((item) => item.itemType === "routine")).toBe(false);
    expect(classifyReplanImpact(previous, draft, principled, 5)).toMatchObject({
      impact: "IMPORTANT_CHANGE", reasons: expect.arrayContaining(["protected_routine_removed"])
    });
  });
});
