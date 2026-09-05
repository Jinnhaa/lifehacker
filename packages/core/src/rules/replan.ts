export interface ReplanInput {
  readonly overCapacity: boolean;
  readonly taskDurationOverrunMinutes: number;
  readonly durationOverrunThresholdMinutes: number;
  readonly importantDeadlineConflict: boolean;
  readonly activePlanItemUnavailable: boolean;
  readonly releasedCapacityMinutes?: number;
}

export const shouldReplan = (input: ReplanInput): boolean =>
  input.overCapacity ||
  input.taskDurationOverrunMinutes > input.durationOverrunThresholdMinutes ||
  (input.releasedCapacityMinutes ?? 0) > 0 ||
  input.importantDeadlineConflict ||
  input.activePlanItemUnavailable;

export const replanTriggerReasons = [
  "task_overrun",
  "task_completed_early",
  "task_blocked",
  "task_switched",
  "manual_replan"
] as const;

export type ReplanTriggerReason = (typeof replanTriggerReasons)[number];

export const shouldReplanForTrigger = (reason: ReplanTriggerReason, deltaMinutes = 0): boolean => {
  if (reason === "manual_replan") return true;
  return shouldReplan({
    overCapacity: reason === "task_overrun" && deltaMinutes > 0,
    taskDurationOverrunMinutes: reason === "task_overrun" ? Math.max(deltaMinutes, 0) : 0,
    durationOverrunThresholdMinutes: 0,
    releasedCapacityMinutes: reason === "task_completed_early" ? Math.max(-deltaMinutes, 0) : 0,
    importantDeadlineConflict: false,
    activePlanItemUnavailable: reason === "task_blocked" || reason === "task_switched"
  });
};
