import { describe, expect, it } from "vitest";
import { projectGoalProgress, type GoalObjectiveEvidence, type GoalTaskEvidence, type PlanningGoalEvidence } from "./goal-progress.js";

const goal = (id: string, level: PlanningGoalEvidence["level"] = "WEEKLY", parentGoalId: string | null = null): PlanningGoalEvidence => ({
  id, title: id, level, parentGoalId, periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "active"
});
const objective = (overrides: Partial<GoalObjectiveEvidence> = {}): GoalObjectiveEvidence => ({
  id: "objective", goalId: "weekly", status: "active", successCriteria: "Explicit outcome",
  progressMode: "STATUS", targetValue: null, currentValue: null, unit: null, ...overrides
});
const task = (overrides: Partial<GoalTaskEvidence> = {}): GoalTaskEvidence => ({
  id: "task", objectiveId: "objective", status: "IN_PROGRESS", estimatedMinutes: 120, estimatedUserMinutes: null, actualMinutes: 60, ...overrides
});
const project = (objectives: readonly GoalObjectiveEvidence[], tasks: readonly GoalTaskEvidence[] = []) =>
  projectGoalProgress({ goals: [goal("weekly")], objectives, tasks })[0]!;

describe("goal planning progress", () => {
  it("keeps an incomplete STATUS milestone at zero", () => {
    expect(project([objective()])).toEqual({ goalId: "weekly", progress: 0, remainingMinutes: 0, evidenceKind: "status" });
  });

  it.each(["achieved", "completed", "done", "DONE"])("completes a STATUS milestone with %s status", (status) => {
    expect(project([objective({ status })])).toMatchObject({ progress: 100, evidenceKind: "status" });
  });

  it("never converts time or completed Tasks into partial STATUS progress", () => {
    expect(project([objective()], [task(), task({ id: "done", status: "DONE", estimatedMinutes: 500 })]))
      .toEqual({ goalId: "weekly", progress: 0, remainingMinutes: 60, evidenceKind: "status" });
  });

  it("counts four DONE Tasks out of six, independent of duration", () => {
    const tasks = Array.from({ length: 6 }, (_, index) => task({ id: `task-${index}`, status: index < 4 ? "DONE" : "IN_PROGRESS" }));
    const result = project([objective({ progressMode: "TASK_COUNT" })], tasks);
    expect(result).toMatchObject({ progress: 67, evidenceKind: "task_count" });
    expect(project([objective({ progressMode: "TASK_COUNT" })], tasks.map((item, index) => ({
      ...item, estimatedMinutes: index * 1000, estimatedUserMinutes: index % 2 ? 1 : null, actualMinutes: 9999
    }))).progress).toBe(result.progress);
  });

  it("counts only uppercase DONE as Task completion", () => {
    expect(project([objective({ progressMode: "TASK_COUNT" })], [task({ status: "done" }), task({ id: "other", status: "WAITING_FOR_USER" })]))
      .toMatchObject({ progress: 0, evidenceKind: "task_count" });
  });

  it("has no TASK_COUNT evidence without child Tasks", () => {
    expect(project([objective({ progressMode: "TASK_COUNT" })])).toMatchObject({ progress: 0, evidenceKind: "none" });
  });

  it("uses twelve out of eighteen numeric units without mutating the evidence", () => {
    const evidence = objective({ progressMode: "NUMERIC", currentValue: 12, targetValue: 18, unit: "lessons" });
    expect(project([evidence], [task({ actualMinutes: 1000 })])).toMatchObject({ progress: 67, evidenceKind: "numeric" });
    expect(evidence.currentValue).toBe(12);
  });

  it("clamps numeric progress above target to 100", () => {
    expect(project([objective({ progressMode: "NUMERIC", currentValue: 24, targetValue: 18 })])).toMatchObject({ progress: 100, evidenceKind: "numeric" });
  });

  it.each([null, 0, -1, NaN, Infinity])("has no NUMERIC evidence for invalid target %s", (targetValue) => {
    expect(project([objective({ progressMode: "NUMERIC", currentValue: 12, targetValue })], [task()]))
      .toMatchObject({ progress: 0, remainingMinutes: 60, evidenceKind: "none" });
  });

  it.each([null, -1, NaN, Infinity])("has no NUMERIC evidence for missing/invalid current value %s", (currentValue) => {
    expect(project([objective({ progressMode: "NUMERIC", currentValue, targetValue: 18 })]))
      .toMatchObject({ progress: 0, evidenceKind: "none" });
  });

  it("distinguishes explicit zero numeric evidence from no evidence", () => {
    expect(project([objective({ progressMode: "NUMERIC", currentValue: 0, targetValue: 18 })]))
      .toMatchObject({ progress: 0, evidenceKind: "numeric" });
  });

  it("aggregates usable child Goals equally and excludes children without evidence", () => {
    const results = projectGoalProgress({
      goals: [goal("parent", "LONG_TERM"), goal("a", "MONTHLY", "parent"), goal("b", "MONTHLY", "parent"), goal("empty", "MONTHLY", "parent")],
      objectives: [objective({ id: "a-objective", goalId: "a", status: "achieved" }), objective({ id: "b-objective", goalId: "b" })],
      tasks: [task({ objectiveId: "a-objective", status: "DONE", estimatedMinutes: 10 }), task({ id: "large", objectiveId: "b-objective", estimatedMinutes: 1000, actualMinutes: 0 })]
    });
    expect(results.find((item) => item.goalId === "parent")).toEqual({ goalId: "parent", progress: 50, remainingMinutes: 1000, evidenceKind: "children" });
  });

  it("falls back to children when direct Objectives lack usable evidence", () => {
    const [result] = projectGoalProgress({
      goals: [goal("parent"), goal("child", "WEEKLY", "parent")],
      objectives: [objective({ goalId: "parent", progressMode: "TASK_COUNT" }), objective({ id: "child-objective", goalId: "child", status: "achieved" })], tasks: []
    });
    expect(result).toMatchObject({ progress: 100, evidenceKind: "children" });
  });

  it("prefers direct explicit Objective evidence even at zero over child progress", () => {
    const [result] = projectGoalProgress({
      goals: [goal("parent"), goal("child", "WEEKLY", "parent")],
      objectives: [objective({ goalId: "parent" }), objective({ id: "child-objective", goalId: "child", status: "achieved" })], tasks: []
    });
    expect(result).toMatchObject({ progress: 0, evidenceKind: "status" });
  });

  it("aggregates mixed explicit modes equally, excluding unusable Objectives", () => {
    const result = project([
      objective({ id: "status", status: "achieved" }),
      objective({ id: "count", progressMode: "TASK_COUNT" }),
      objective({ id: "numeric", progressMode: "NUMERIC", currentValue: 12, targetValue: 18 }),
      objective({ id: "unknown", progressMode: "NUMERIC" })
    ], [
      task({ objectiveId: "count", status: "DONE", estimatedMinutes: 1, actualMinutes: 0 }),
      task({ id: "large", objectiveId: "count", status: "PLANNED", estimatedMinutes: 1000, actualMinutes: 0 })
    ]);
    expect(result).toMatchObject({ progress: 72, remainingMinutes: 1000, evidenceKind: "mixed_objectives" });
  });

  it("keeps effort estimation independent with user estimates and nonnegative remaining effort", () => {
    expect(project([objective()], [
      task({ estimatedUserMinutes: 90, actualMinutes: 30 }),
      task({ id: "overrun", actualMinutes: 200 }),
      task({ id: "done", status: "DONE", actualMinutes: 0 }),
      task({ id: "unknown", estimatedMinutes: null, actualMinutes: 0 })
    ])).toMatchObject({ progress: 0, remainingMinutes: 60, evidenceKind: "status" });
  });

  it("removes legacy workload-only partial progress and ignores stored Goal progress", () => {
    const legacyGoal = { ...goal("weekly"), progress: 90 };
    const results = projectGoalProgress({
      goals: [legacyGoal],
      objectives: [objective({ successCriteria: null })], tasks: [task()]
    });
    expect(results[0]).toEqual({ goalId: "weekly", progress: 0, remainingMinutes: 60, evidenceKind: "status" });
  });

  it("returns none for an empty Goal and a parent with only no-evidence children", () => {
    expect(projectGoalProgress({ goals: [goal("parent"), goal("child", "WEEKLY", "parent")], objectives: [], tasks: [] }))
      .toEqual(["parent", "child"].map((goalId) => ({ goalId, progress: 0, remainingMinutes: 0, evidenceKind: "none" })));
  });
});
