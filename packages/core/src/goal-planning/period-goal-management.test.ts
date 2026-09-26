import type { UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { objectiveProgressLabel, projectGoalProgress, type GoalObjectiveEvidence, type GoalTaskEvidence } from "./goal-progress.js";
import { PeriodGoalManagementService, periodObjectiveInputSchema, validatePeriodGoalParent, type PeriodGoalManagementRepository } from "./period-goal-management.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const id = "10000000-0000-4000-8000-000000000002";
const base = { title: "Goal", level: "WEEKLY" as const, periodStart: "2026-09-21", periodEnd: "2026-09-27", parentGoalId: id };
const objective: GoalObjectiveEvidence = { id, goalId: "goal", status: "active", successCriteria: null, progressMode: "NUMERIC", targetValue: 18, currentValue: 0, unit: "강" };
const task = (status: string, minutes = 120): GoalTaskEvidence => ({ id: status, objectiveId: id, status, estimatedMinutes: minutes, estimatedUserMinutes: null, actualMinutes: 60 });

describe("period goal validation and presentation", () => {
  it("allows Weekly to reference an active Monthly Goal", () => {
    expect(() => validatePeriodGoalParent(base, { id, level: "MONTHLY", status: "active" })).not.toThrow();
  });
  it.each(["WEEKLY", "LONG_TERM"] as const)("rejects Weekly parent level %s", (level) => {
    expect(() => validatePeriodGoalParent(base, { id, level, status: "active" })).toThrow("상위");
  });
  it("rejects missing, self, and archived parents", () => {
    expect(() => validatePeriodGoalParent(base, null)).toThrow();
    expect(() => validatePeriodGoalParent(base, { id, level: "MONTHLY", status: "active" }, id)).toThrow();
    expect(() => validatePeriodGoalParent(base, { id, level: "MONTHLY", status: "archived" })).toThrow();
  });
  it("rejects invalid Numeric target before persistence", () => {
    const repository: PeriodGoalManagementRepository = { saveGoal: vi.fn(), archiveGoal: vi.fn(), saveObjective: vi.fn(), cancelObjective: vi.fn() };
    const service = new PeriodGoalManagementService(repository);
    expect(() => service.saveObjective(userId, null, { title: "Measure", goalId: id, progressMode: "NUMERIC", status: "active", successCriteria: null, targetDate: null, targetValue: 0, currentValue: 0, unit: null })).toThrow();
    expect(repository.saveObjective).not.toHaveBeenCalled();
  });
  it("clears numeric storage for Task count and Status modes", () => {
    const parsed = periodObjectiveInputSchema.parse({ title: "Tasks", goalId: id, progressMode: "TASK_COUNT", status: "active", successCriteria: null, targetDate: null, targetValue: 18, currentValue: 12, unit: "강" });
    expect(parsed).toMatchObject({ targetValue: null, currentValue: null, unit: null });
  });
  it("presents Task count from actual DONE children", () => {
    expect(objectiveProgressLabel({ ...objective, progressMode: "TASK_COUNT" }, [task("DONE"), task("PLANNED")])).toBe("1 / 2 Tasks");
  });
  it("does not use duration in textual progress", () => {
    const count = { ...objective, progressMode: "TASK_COUNT" as const };
    expect(objectiveProgressLabel(count, [task("PLANNED", 120)])).toBe("0 / 1 Tasks");
    expect(objectiveProgressLabel(count, [task("PLANNED", 600)])).toBe("0 / 1 Tasks");
  });
  it("distinguishes measured zero from no evidence", () => {
    expect(objectiveProgressLabel(objective, [])).toBe("0 / 18 강");
    expect(objectiveProgressLabel({ ...objective, progressMode: "TASK_COUNT" }, [])).toBe("진행 기준 없음");
    const goals = [{ id: "goal", title: "Goal", level: "WEEKLY" as const, parentGoalId: null, periodStart: null, periodEnd: null, status: "active" }];
    expect(projectGoalProgress({ goals, objectives: [], tasks: [] })[0]?.evidenceKind).toBe("none");
    expect(projectGoalProgress({ goals, objectives: [objective], tasks: [] })[0]).toMatchObject({ evidenceKind: "numeric", progress: 0 });
  });
  it("uses only complete/incomplete state for STATUS", () => {
    expect(objectiveProgressLabel({ ...objective, progressMode: "STATUS" }, [])).toBe("미완료");
    expect(objectiveProgressLabel({ ...objective, progressMode: "STATUS", status: "achieved" }, [])).toBe("완료");
  });
});
