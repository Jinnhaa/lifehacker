export type PlanningGoalLevel = "LONG_TERM" | "MONTHLY" | "WEEKLY";

export interface PlanningGoalEvidence {
  readonly id: string;
  readonly title: string;
  readonly level: PlanningGoalLevel;
  readonly parentGoalId: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly status: string;
}

export type ObjectiveProgressMode = "STATUS" | "TASK_COUNT" | "NUMERIC";
export type GoalProgressEvidenceKind = "status" | "task_count" | "numeric" | "children" | "mixed_objectives" | "none";

export interface GoalObjectiveEvidence {
  readonly id: string;
  readonly goalId: string;
  readonly status: string;
  readonly successCriteria: string | null;
  readonly progressMode: ObjectiveProgressMode;
  readonly targetValue: number | null;
  readonly currentValue: number | null;
  readonly unit: string | null;
}

export interface GoalTaskEvidence {
  readonly id: string;
  readonly objectiveId: string | null;
  readonly status: string;
  readonly estimatedMinutes: number | null;
  readonly estimatedUserMinutes: number | null;
  readonly actualMinutes: number;
}

export interface GoalProgressProjection {
  readonly goalId: string;
  /** Semantic completion from explicit evidence only; zero is safe when evidenceKind is none. */
  readonly progress: number;
  /** Effort remaining for capacity planning; independent of semantic completion. */
  readonly remainingMinutes: number;
  readonly evidenceKind: GoalProgressEvidenceKind;
}

const taskEstimate = (task: GoalTaskEvidence): number => Math.max(task.estimatedUserMinutes ?? task.estimatedMinutes ?? 0, 0);
const milestoneCompleted = (status: string): boolean => ["achieved", "completed", "done"].includes(status.toLowerCase());
const percent = (done: number, total: number): number => Math.min(100, Math.max(0, done / total * 100));

const objectiveProgress = (objective: GoalObjectiveEvidence, tasks: readonly GoalTaskEvidence[]): {
  readonly progress: number;
  readonly evidenceKind: "status" | "task_count" | "numeric";
} | null => {
  switch (objective.progressMode) {
    case "STATUS":
      return { progress: milestoneCompleted(objective.status) ? 100 : 0, evidenceKind: "status" };
    case "TASK_COUNT":
      return tasks.length > 0
        ? { progress: percent(tasks.filter((task) => task.status === "DONE").length, tasks.length), evidenceKind: "task_count" }
        : null;
    case "NUMERIC":
      return objective.targetValue !== null && Number.isFinite(objective.targetValue) && objective.targetValue > 0
        && objective.currentValue !== null && Number.isFinite(objective.currentValue) && objective.currentValue >= 0
        ? { progress: percent(objective.currentValue, objective.targetValue), evidenceKind: "numeric" }
        : null;
  }
};

export function projectGoalProgress(input: {
  readonly goals: readonly PlanningGoalEvidence[];
  readonly objectives: readonly GoalObjectiveEvidence[];
  readonly tasks: readonly GoalTaskEvidence[];
}): readonly GoalProgressProjection[] {
  const objectivesByGoal = new Map<string, GoalObjectiveEvidence[]>();
  for (const objective of input.objectives) {
    const list = objectivesByGoal.get(objective.goalId) ?? [];
    list.push(objective);
    objectivesByGoal.set(objective.goalId, list);
  }
  const tasksByObjective = new Map<string, GoalTaskEvidence[]>();
  for (const task of input.tasks) {
    if (!task.objectiveId) continue;
    const list = tasksByObjective.get(task.objectiveId) ?? [];
    list.push(task);
    tasksByObjective.set(task.objectiveId, list);
  }
  const projections = new Map<string, GoalProgressProjection>();
  const visiting = new Set<string>();
  const project = (goal: PlanningGoalEvidence): GoalProgressProjection => {
    const existing = projections.get(goal.id);
    if (existing) return existing;
    if (visiting.has(goal.id)) return { goalId: goal.id, progress: 0, remainingMinutes: 0, evidenceKind: "none" };
    visiting.add(goal.id);
    const objectives = objectivesByGoal.get(goal.id) ?? [];
    const explicitObjectives = objectives.flatMap((objective) => {
      const evidence = objectiveProgress(objective, tasksByObjective.get(objective.id) ?? []);
      return evidence ? [evidence] : [];
    });
    const children = input.goals.filter((candidate) => candidate.parentGoalId === goal.id).map(project);
    const usableChildren = children.filter((child) => child.evidenceKind !== "none");
    const remainingMinutes = objectives.flatMap((objective) => tasksByObjective.get(objective.id) ?? [])
      .reduce((sum, task) => sum + (task.status === "DONE" ? 0 : Math.max(0, taskEstimate(task) - Math.max(0, task.actualMinutes))), 0)
      + children.reduce((sum, child) => sum + child.remainingMinutes, 0);
    let result: GoalProgressProjection;
    if (explicitObjectives.length > 0) {
      const kinds = new Set(explicitObjectives.map((objective) => objective.evidenceKind));
      result = {
        goalId: goal.id,
        progress: Math.round(explicitObjectives.reduce((sum, objective) => sum + objective.progress, 0) / explicitObjectives.length),
        remainingMinutes,
        evidenceKind: kinds.size === 1 ? explicitObjectives[0]!.evidenceKind : "mixed_objectives"
      };
    } else if (usableChildren.length > 0) {
      result = {
        goalId: goal.id,
        progress: Math.round(usableChildren.reduce((sum, child) => sum + child.progress, 0) / usableChildren.length),
        remainingMinutes, evidenceKind: "children"
      };
    } else {
      result = { goalId: goal.id, progress: 0, remainingMinutes, evidenceKind: "none" };
    }
    visiting.delete(goal.id);
    projections.set(goal.id, result);
    return result;
  };
  return input.goals.map(project);
}
