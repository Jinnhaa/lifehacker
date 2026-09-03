export const calculateRecurringActivityRisk = (input) => {
    const remainingCount = Math.max(input.targetCount - input.completedCount, 0);
    const suitableDays = Math.max(input.remainingSuitableDays, 0);
    const risk = remainingCount <= 0 || remainingCount < suitableDays
        ? "LOW"
        : remainingCount === suitableDays
            ? "MEDIUM"
            : "HIGH";
    return { remainingCount, risk };
};
//# sourceMappingURL=recurring-activity.js.map