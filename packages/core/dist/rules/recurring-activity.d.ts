export type RecurringActivityRisk = "LOW" | "MEDIUM" | "HIGH";
export interface RecurringActivityRiskInput {
    readonly targetCount: number;
    readonly completedCount: number;
    readonly remainingSuitableDays: number;
}
export interface RecurringActivityRiskResult {
    readonly remainingCount: number;
    readonly risk: RecurringActivityRisk;
}
export declare const calculateRecurringActivityRisk: (input: RecurringActivityRiskInput) => RecurringActivityRiskResult;
//# sourceMappingURL=recurring-activity.d.ts.map