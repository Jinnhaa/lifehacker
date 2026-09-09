import { resolvePlanningWork } from "../morning/planning-work.js";
import { calculateRecurringActivityRisk } from "../rules/recurring-activity.js";
import type { MorningObservation, MorningPlanDraft } from "../morning/morning.js";
import type { ReplanDecision, ReplanPlanState } from "./replan.js";

const idsInDraft = (draft: MorningPlanDraft, type: "task" | "routine"): Set<string> => new Set(
  draft.items.flatMap((item) => type === "task"
    ? item.itemType === "task" && item.taskId ? [item.taskId] : []
    : item.itemType === "routine" && item.recurringActivityId ? [item.recurringActivityId] : [])
);

const remainingSuitableDays = (preferredDays: readonly number[] | null, weekday: number): number =>
  !preferredDays || preferredDays.length === 0 ? 8 - weekday : preferredDays.filter((day) => day >= weekday).length;

export const classifyReplanImpact = (
  previous: ReplanPlanState,
  draft: MorningPlanDraft,
  observation: MorningObservation,
  localWeekday: number
): ReplanDecision => {
  const taskIds = idsInDraft(draft, "task");
  const routineIds = idsInDraft(draft, "routine");
  const reasons: string[] = [];

  if (previous.activeTaskId && !taskIds.has(previous.activeTaskId)) reasons.push("active_focus_task_removed");

  for (const item of previous.items) {
    const task = observation.tasks.find((value) => value.id === item.taskId);
    const work = task ? resolvePlanningWork(task, observation) : null;
    const importance = Math.max(item.taskImportance ?? 0, work?.importance ?? 0);
    const deadline = work?.deadline ?? item.taskDeadline;
    if (
      item.itemType === "task"
      && item.taskId
      && importance >= 4
      && item.taskStatus !== "DONE"
      && item.taskStatus !== "BLOCKED"
      && item.status !== "switched"
      && !taskIds.has(item.taskId)
    ) reasons.push("important_task_removed");
    if (
      item.itemType === "task"
      && item.taskId
      && deadline
      && deadline <= previous.workUntil
      && item.taskStatus !== "DONE"
      && item.taskStatus !== "BLOCKED"
    ) {
      const ends = draft.items.filter((draftItem) => draftItem.taskId === item.taskId).map((draftItem) => draftItem.end.getTime());
      if (ends.length === 0 || Math.max(...ends) > deadline.getTime()) reasons.push("deadline_risk_increased");
    }
  }

  for (const activity of observation.recurringActivities) {
    const risk = calculateRecurringActivityRisk({
      targetCount: activity.targetCount,
      completedCount: activity.completedCount,
      remainingSuitableDays: remainingSuitableDays(activity.preferredDays, localWeekday)
    });
    if ((risk.risk === "MEDIUM" || risk.risk === "HIGH") && risk.remainingCount > 0 && !routineIds.has(activity.id)) {
      reasons.push("protected_routine_removed");
    }
  }

  if (draft.items.some((item) => item.end > previous.workUntil)) reasons.push("work_until_exceeded");
  const protectedIntervals = observation.constraints.filter((constraint) => constraint.blocksCapacity);
  if (draft.items.some((item) => protectedIntervals.some((constraint) => item.start < constraint.end && item.end > constraint.start))) {
    reasons.push("protected_time_overlapped");
  }
  return reasons.length > 0
    ? { impact: "IMPORTANT_CHANGE", reasons: [...new Set(reasons)] }
    : { impact: "SMALL_CHANGE", reasons: [] };
};
