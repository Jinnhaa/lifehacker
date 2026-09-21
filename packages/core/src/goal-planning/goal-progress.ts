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

export interface GoalObjectiveEvidence {
  readonly id: string;
  readonly goalId: string;
  readonly status: string;
  readonly successCriteria: string | null;
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
  readonly progress: number;
  readonly remainingMinutes: number;
  readonly evidenceKind: "milestones" | "workload" | "children" | "none";
}

const taskEstimate = (task: GoalTaskEvidence): number => Math.max(task.estimatedUserMinutes ?? task.estimatedMinutes ?? 0, 0);
const milestoneCompleted = (status: string): boolean => ["achieved", "completed", "done"].includes(status.toLowerCase());
const taskCompletedMinutes = (task: GoalTaskEvidence): number => {
  const estimate = taskEstimate(task);
  return task.status === "DONE" ? estimate : Math.min(Math.max(task.actualMinutes, 0), estimate);
};
const percent = (done: number, total: number): number => total > 0 ? Math.round(Math.min(100, Math.max(0, done / total * 100))) : 0;

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
    const milestones = objectives.filter((objective) => Boolean(objective.successCriteria?.trim()));
    let result: GoalProgressProjection;
    if (milestones.length > 0) {
      const progress = milestones.reduce((sum, milestone) => {
        if (milestoneCompleted(milestone.status)) return sum + 100;
        const tasks = tasksByObjective.get(milestone.id) ?? [];
        return sum + percent(tasks.reduce((value, task) => value + taskCompletedMinutes(task), 0), tasks.reduce((value, task) => value + taskEstimate(task), 0));
      }, 0) / milestones.length;
      const remainingMinutes = milestones.flatMap((milestone) => tasksByObjective.get(milestone.id) ?? [])
        .reduce((sum, task) => sum + (task.status === "DONE" ? 0 : Math.max(0, taskEstimate(task) - task.actualMinutes)), 0);
      result = { goalId: goal.id, progress: Math.round(progress), remainingMinutes, evidenceKind: "milestones" };
    } else if (objectives.length > 0) {
      const tasks = objectives.flatMap((objective) => tasksByObjective.get(objective.id) ?? []);
      const total = tasks.reduce((sum, task) => sum + taskEstimate(task), 0);
      const done = tasks.reduce((sum, task) => sum + taskCompletedMinutes(task), 0);
      result = {
        goalId: goal.id, progress: percent(done, total),
        remainingMinutes: tasks.reduce((sum, task) => sum + (task.status === "DONE" ? 0 : Math.max(0, taskEstimate(task) - task.actualMinutes)), 0),
        evidenceKind: total > 0 ? "workload" : "none"
      };
    } else {
      const children = input.goals.filter((candidate) => candidate.parentGoalId === goal.id).map(project);
      result = children.length ? {
        goalId: goal.id,
        progress: Math.round(children.reduce((sum, child) => sum + child.progress, 0) / children.length),
        remainingMinutes: children.reduce((sum, child) => sum + child.remainingMinutes, 0), evidenceKind: "children"
      } : { goalId: goal.id, progress: 0, remainingMinutes: 0, evidenceKind: "none" };
    }
    visiting.delete(goal.id);
    projections.set(goal.id, result);
    return result;
  };
  return input.goals.map(project);
}
