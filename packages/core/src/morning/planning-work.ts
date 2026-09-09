import { zonedDateTimeToUtc } from "@amber/shared";
import type { Task } from "../task/task.js";
import type { MorningObservation } from "./morning.js";

// Derived planning facts never overwrite the task's own estimates or deadlines.
export const resolvePlanningWork = (task: Task, observation: MorningObservation) => {
  const objective = observation.objectives?.find((value) => value.id === task.objectiveId);
  const workContextId = task.workContextId ?? objective?.workContextId ?? null;
  const workContext = observation.workContexts?.find((value) => value.id === workContextId);
  const goal = observation.goals?.find((value) => value.id === objective?.goalId);
  const objectiveDeadline = objective?.targetDate
    ? zonedDateTimeToUtc(`${objective.targetDate}T23:59:59`, observation.timeZone) : null;
  const deadlines = [task.officialDeadline, task.internalDeadline, objectiveDeadline]
    .filter((value): value is Date => value !== null);
  return {
    eligible: ![objective, workContext, goal].some((value) => value && value.status !== "active"),
    deadline: deadlines.length > 0 ? new Date(Math.min(...deadlines.map((value) => value.getTime()))) : null,
    importance: Math.max(task.importance, objective?.importance ?? 0, goal?.importance ?? 0),
    directiveTargetIds: [task.id, task.objectiveId, workContextId, objective?.goalId]
      .filter((value): value is string => value != null)
  };
};
