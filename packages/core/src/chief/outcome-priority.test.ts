import type { TaskId, UserId } from "@amber/shared";
import { describe, expect, it } from "vitest";
import type { Task } from "../task/task.js";
import type { MorningObservation } from "../morning/morning.js";
import { judgeOutcomes, outcomeFingerprint } from "./outcome-priority.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const now = new Date("2026-09-12T00:00:00.000Z");

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: id as TaskId,
  userId,
  workContextId: null,
  objectiveId: null,
  title: id,
  description: null,
  executionMode: "standard",
  officialDeadline: null,
  internalDeadline: null,
  estimatedMinutes: 30,
  estimatedUserMinutes: null,
  actualMinutes: 0,
  importance: 3,
  status: "INBOX",
  nextAction: null,
  completionCriteria: null,
  completionSource: null,
  createdAt: now,
  completedAt: null,
  updatedAt: now,
  ...overrides
});

const observation = (tasks: readonly Task[], evidence: Partial<NonNullable<MorningObservation["outcomeEvidence"]>> = {}): MorningObservation => ({
  timeZone: "Asia/Seoul",
  planningBufferMinutes: 0,
  planningPolicy: {},
  constraints: [],
  tasks,
  recurringActivities: [],
  strategicDirectives: [],
  outcomeEvidence: {
    dependencies: [],
    steps: [],
    objectives: [],
    goals: [],
    artifacts: [],
    approvedPlan: null,
    activeFocusTaskId: null,
    approvedAction: null,
    ...evidence
  }
});

const judge = (tasks: readonly Task[], evidence: Partial<NonNullable<MorningObservation["outcomeEvidence"]>> = {}, workUntil = new Date("2026-09-12T03:00:00.000Z")) =>
  judgeOutcomes({ observation: observation(tasks, evidence), now, workUntil, privateIntervals: [], localWeekday: 6 });

describe("Chief outcome priority", () => {
  it("selects a task due today and excludes completed work", () => {
    const result = judge([
      task("due", { officialDeadline: new Date("2026-09-12T14:59:00.000Z") }),
      task("done", { status: "DONE" })
    ]);
    expect(result.todayPriority.map((choice) => choice.taskId)).toEqual(["due"]);
    expect(result.eligibleTaskIds).not.toContain("done");
    expect(result.todayPriority[0]?.reasonCodes).toContain("DUE_TODAY");
  });

  it("uses dependency evidence to prioritize the prerequisite and blocks the dependent task", () => {
    const result = judge([task("prerequisite"), task("dependent")], {
      dependencies: [{ taskId: "dependent", prerequisiteTaskId: "prerequisite", completed: false }]
    });
    expect(result.todayPriority[0]?.taskId).toBe("prerequisite");
    expect(result.todayPriority[0]?.reasonCodes).toContain("UNBLOCKS");
    expect(result.eligibleTaskIds).not.toContain("dependent");
    expect(result.notToday.find((choice) => choice.taskId === "dependent")?.reasonCodes).toContain("BLOCKED");
  });

  it("offers at most one future relief item only when downstream evidence exists", () => {
    const urgent = ["urgent-1", "urgent-2", "urgent-3"].map((id) => task(id, {
      officialDeadline: new Date("2026-09-12T14:59:00.000Z")
    }));
    const withRelief = judge([...urgent, task("relief")], {
      dependencies: [{ taskId: "later", prerequisiteTaskId: "relief", completed: false }]
    });
    expect(withRelief.todayPriority).toHaveLength(3);
    expect(withRelief.futureRelief?.taskId).toBe("relief");
    expect(withRelief.futureRelief?.reasonCodes).toContain("UNBLOCKS");

    const withoutEvidence = judge([...urgent, task("ordinary")]);
    expect(withoutEvidence.futureRelief).toBeNull();
  });

  it("keeps blocked work out of priority and respects capacity", () => {
    const result = judge([
      task("available"),
      task("blocked", { status: "BLOCKED" }),
      task("too-late")
    ], {}, new Date("2026-09-12T00:30:00.000Z"));
    expect(result.todayPriority.map((choice) => choice.taskId)).toEqual(["available"]);
    expect(result.notToday.find((choice) => choice.taskId === "blocked")?.reasonCodes).toContain("BLOCKED");
    expect(result.notToday.find((choice) => choice.taskId === "too-late")?.reasonCodes).toContain("CAPACITY");
  });

  it("preserves the active focus as current mission", () => {
    const result = judge([task("focus"), task("other")], { activeFocusTaskId: "focus" });
    expect(result.currentMission).toMatchObject({ taskId: "focus", source: "focus_session" });
    expect(result.currentMission?.reasonCodes).toContain("ACTIVE_FOCUS");
  });

  it("keeps an executable AI-owned step eligible until its status is waiting", () => {
    const result = judge([task("ai-task")], {
      steps: [{ id: "step-1", taskId: "ai-task", position: 1, owner: "ai", status: "pending", reviewOfStepId: null }]
    });
    expect(result.eligibleTaskIds).toContain("ai-task");
    expect(result.todayPriority[0]?.taskId).toBe("ai-task");
  });

  it("preserves approved plan evidence and produces a stable fingerprint", () => {
    const evidence = { approvedPlan: { id: "plan-1", revisionNo: 2 } };
    const first = judge([task("planned")], evidence);
    const second = judge([task("planned")], evidence);
    expect(first.approvedPlan).toEqual({ id: "plan-1", revisionNo: 2 });
    expect(outcomeFingerprint(first)).toBe(outcomeFingerprint(second));
  });
});
