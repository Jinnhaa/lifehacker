export interface ReplanInput {
    readonly overCapacity: boolean;
    readonly taskDurationOverrunMinutes: number;
    readonly durationOverrunThresholdMinutes: number;
    readonly importantDeadlineConflict: boolean;
    readonly activePlanItemUnavailable: boolean;
    readonly releasedCapacityMinutes?: number;
}
export declare const shouldReplan: (input: ReplanInput) => boolean;
export declare const replanTriggerReasons: readonly ["task_overrun", "task_completed_early", "task_blocked", "task_switched", "manual_replan"];
export type ReplanTriggerReason = (typeof replanTriggerReasons)[number];
export declare const shouldReplanForTrigger: (reason: ReplanTriggerReason, deltaMinutes?: number) => boolean;
//# sourceMappingURL=replan.d.ts.map