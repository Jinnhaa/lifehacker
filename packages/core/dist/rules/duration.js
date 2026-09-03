export const getRemainingMinutes = (estimatedMinutes, actualMinutes) => estimatedMinutes === null ? null : Math.max(estimatedMinutes - actualMinutes, 0);
export const getEstimateError = (estimatedMinutes, actualMinutes) => actualMinutes - estimatedMinutes;
export const getActualVsEstimatedRatio = (estimatedMinutes, actualMinutes) => estimatedMinutes === 0 ? null : actualMinutes / estimatedMinutes;
//# sourceMappingURL=duration.js.map