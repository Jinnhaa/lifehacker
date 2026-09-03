export interface ReplanInput {
    readonly overCapacity: boolean;
    readonly taskDurationOverrunMinutes: number;
    readonly durationOverrunThresholdMinutes: number;
    readonly importantDeadlineConflict: boolean;
    readonly activePlanItemUnavailable: boolean;
}
export declare const shouldReplan: (input: ReplanInput) => boolean;
//# sourceMappingURL=replan.d.ts.map