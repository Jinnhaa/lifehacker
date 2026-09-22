import { describe, expect, it } from "vitest";
import { projectGoalProgress, type PlanningGoalEvidence } from "./goal-progress.js";

const goal = (id: string, level: PlanningGoalEvidence["level"], parentGoalId: string | null = null): PlanningGoalEvidence => ({
  id, title: id, level, parentGoalId, periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "active"
});

describe("goal planning progress", () => {
  it("uses explicit milestone completion before workload fallback", () => {
    const [result] = projectGoalProgress({
      goals: [goal("weekly", "WEEKLY")],
      objectives: [
        { id: "m1", goalId: "weekly", status: "achieved", successCriteria: "초안 승인" },
        { id: "m2", goalId: "weekly", status: "active", successCriteria: "최종 제출" }
      ],
      tasks: [{ id: "task", objectiveId: "m2", status: "PLANNED", estimatedMinutes: 120, estimatedUserMinutes: null, actualMinutes: 60 }]
    });
    expect(result).toEqual({ goalId: "weekly", progress: 75, remainingMinutes: 60, evidenceKind: "milestones" });
  });

  it("weights progress by estimated workload instead of task count", () => {
    const [result] = projectGoalProgress({
      goals: [goal("monthly", "MONTHLY")],
      objectives: [{ id: "bucket", goalId: "monthly", status: "active", successCriteria: null }],
      tasks: [
        { id: "small", objectiveId: "bucket", status: "DONE", estimatedMinutes: 10, estimatedUserMinutes: null, actualMinutes: 10 },
        { id: "large", objectiveId: "bucket", status: "PLANNED", estimatedMinutes: 90, estimatedUserMinutes: null, actualMinutes: 0 }
      ]
    });
    expect(result).toEqual({ goalId: "monthly", progress: 10, remainingMinutes: 90, evidenceKind: "workload" });
  });

  it("rolls child wins into a parent goal", () => {
    const result = projectGoalProgress({
      goals: [goal("long", "LONG_TERM"), goal("month", "MONTHLY", "long")],
      objectives: [{ id: "bucket", goalId: "month", status: "active", successCriteria: null }],
      tasks: [{ id: "task", objectiveId: "bucket", status: "DONE", estimatedMinutes: 30, estimatedUserMinutes: null, actualMinutes: 30 }]
    });
    expect(result.find((item) => item.goalId === "long")).toMatchObject({ progress: 100, evidenceKind: "children" });
  });
});
