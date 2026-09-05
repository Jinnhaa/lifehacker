import { calculateRecurringActivityRisk } from "../rules/recurring-activity.js";
const idsInDraft = (draft, type) => new Set(draft.items.flatMap((item) => type === "task"
    ? item.itemType === "task" && item.taskId ? [item.taskId] : []
    : item.itemType === "routine" && item.recurringActivityId ? [item.recurringActivityId] : []));
const remainingSuitableDays = (preferredDays, weekday) => !preferredDays || preferredDays.length === 0 ? 8 - weekday : preferredDays.filter((day) => day >= weekday).length;
export const classifyReplanImpact = (previous, draft, observation, localWeekday) => {
    const taskIds = idsInDraft(draft, "task");
    const routineIds = idsInDraft(draft, "routine");
    const reasons = [];
    if (previous.activeTaskId && !taskIds.has(previous.activeTaskId))
        reasons.push("active_focus_task_removed");
    for (const item of previous.items) {
        if (item.itemType === "task"
            && item.taskId
            && item.taskImportance !== null
            && item.taskImportance >= 4
            && item.taskStatus !== "DONE"
            && item.taskStatus !== "BLOCKED"
            && item.status !== "switched"
            && !taskIds.has(item.taskId))
            reasons.push("important_task_removed");
        if (item.itemType === "task"
            && item.taskId
            && item.taskDeadline
            && item.taskDeadline <= previous.workUntil
            && item.taskStatus !== "DONE"
            && item.taskStatus !== "BLOCKED") {
            const ends = draft.items.filter((draftItem) => draftItem.taskId === item.taskId).map((draftItem) => draftItem.end.getTime());
            if (ends.length === 0 || Math.max(...ends) > item.taskDeadline.getTime())
                reasons.push("deadline_risk_increased");
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
    if (draft.items.some((item) => item.end > previous.workUntil))
        reasons.push("work_until_exceeded");
    const protectedIntervals = observation.constraints.filter((constraint) => constraint.blocksCapacity);
    if (draft.items.some((item) => protectedIntervals.some((constraint) => item.start < constraint.end && item.end > constraint.start))) {
        reasons.push("protected_time_overlapped");
    }
    return reasons.length > 0
        ? { impact: "IMPORTANT_CHANGE", reasons: [...new Set(reasons)] }
        : { impact: "SMALL_CHANGE", reasons: [] };
};
//# sourceMappingURL=replan-impact.js.map