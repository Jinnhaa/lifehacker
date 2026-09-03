export const getRemainingMinutes = (estimatedMinutes: number | null, actualMinutes: number): number | null =>
  estimatedMinutes === null ? null : Math.max(estimatedMinutes - actualMinutes, 0);

export const getEstimateError = (estimatedMinutes: number, actualMinutes: number): number =>
  actualMinutes - estimatedMinutes;

export const getActualVsEstimatedRatio = (estimatedMinutes: number, actualMinutes: number): number | null =>
  estimatedMinutes === 0 ? null : actualMinutes / estimatedMinutes;
