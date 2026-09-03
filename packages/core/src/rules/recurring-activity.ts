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

export const calculateRecurringActivityRisk = (
  input: RecurringActivityRiskInput
): RecurringActivityRiskResult => {
  const remainingCount = Math.max(input.targetCount - input.completedCount, 0);
  const suitableDays = Math.max(input.remainingSuitableDays, 0);
  const risk =
    remainingCount <= 0 || remainingCount < suitableDays
      ? "LOW"
      : remainingCount === suitableDays
        ? "MEDIUM"
        : "HIGH";
  return { remainingCount, risk };
};
