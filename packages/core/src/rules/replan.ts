export interface ReplanInput {
  readonly overCapacity: boolean;
  readonly taskDurationOverrunMinutes: number;
  readonly durationOverrunThresholdMinutes: number;
  readonly importantDeadlineConflict: boolean;
  readonly activePlanItemUnavailable: boolean;
}

export const shouldReplan = (input: ReplanInput): boolean =>
  input.overCapacity ||
  input.taskDurationOverrunMinutes > input.durationOverrunThresholdMinutes ||
  input.importantDeadlineConflict ||
  input.activePlanItemUnavailable;
