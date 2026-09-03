export const shouldReplan = (input) => input.overCapacity ||
    input.taskDurationOverrunMinutes > input.durationOverrunThresholdMinutes ||
    input.importantDeadlineConflict ||
    input.activePlanItemUnavailable;
//# sourceMappingURL=replan.js.map