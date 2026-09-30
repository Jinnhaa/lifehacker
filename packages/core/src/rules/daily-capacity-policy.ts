import { zonedDateTimeToUtc } from "@amber/shared";
import type { TimeInterval } from "../morning/morning.js";

const MINUTE = 60_000;
const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const DEFAULT_WAKE_HOUR = 10;
export const DAILY_SLEEP_RESERVE_MINUTES = 480;
export const DAILY_LIFE_RESERVE_MINUTES = 180;
export const DEFAULT_SOFT_HORIZON_HOUR = 2;
export const DEFAULT_MAX_USABLE_DAILY_MINUTES = 24 * 60 - DAILY_SLEEP_RESERVE_MINUTES - DAILY_LIFE_RESERVE_MINUTES;

export interface DailyCapacityPolicy {
  readonly wakeAt: Date;
  readonly softHorizon: Date;
  readonly maxUsableMinutes: number;
}

export interface DailyCapacityInput {
  readonly planDate: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly blockingIntervals: readonly TimeInterval[];
  readonly planningBufferMinutes: number;
  /** Explicit user or saved-policy override; absent uses the 02:00 soft horizon. */
  readonly planningHorizon?: Date;
}

export interface DailyCapacityResult extends DailyCapacityPolicy {
  readonly planningHorizon: Date;
  readonly elapsedMinutes: number;
  readonly blockedMinutes: number;
  readonly planningBufferMinutes: number;
  readonly availableMinutes: number;
}

export const getDefaultDailyCapacityPolicy = (planDate: string, timeZone: string): DailyCapacityPolicy => ({
  wakeAt: zonedDateTimeToUtc(`${planDate}T${String(DEFAULT_WAKE_HOUR).padStart(2, "0")}:00:00`, timeZone),
  softHorizon: zonedDateTimeToUtc(`${addDays(planDate, 1)}T${String(DEFAULT_SOFT_HORIZON_HOUR).padStart(2, "0")}:00:00`, timeZone),
  maxUsableMinutes: DEFAULT_MAX_USABLE_DAILY_MINUTES
});

const minutesBetween = (start: Date, end: Date): number => Math.max(0, Math.floor((end.getTime() - start.getTime()) / MINUTE));

const blockedMinutesWithin = (intervals: readonly TimeInterval[], horizon: TimeInterval): number => {
  const clipped = intervals
    .map((interval) => ({
      start: new Date(Math.max(interval.start.getTime(), horizon.start.getTime())),
      end: new Date(Math.min(interval.end.getTime(), horizon.end.getTime()))
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: TimeInterval[] = [];
  for (const interval of clipped) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push(interval);
    else if (interval.end > previous.end) merged[merged.length - 1] = { start: previous.start, end: interval.end };
  }
  return merged.reduce((sum, interval) => sum + minutesBetween(interval.start, interval.end), 0);
};

export const calculateDailyCapacity = (input: DailyCapacityInput): DailyCapacityResult => {
  const policy = getDefaultDailyCapacityPolicy(input.planDate, input.timeZone);
  const planningHorizon = input.planningHorizon && input.planningHorizon > policy.wakeAt ? input.planningHorizon : policy.softHorizon;
  const elapsedMinutes = minutesBetween(policy.wakeAt, new Date(Math.min(Math.max(input.now.getTime(), policy.wakeAt.getTime()), planningHorizon.getTime())));
  const futureStart = new Date(Math.max(input.now.getTime(), policy.wakeAt.getTime()));
  const blockedMinutes = futureStart < planningHorizon
    ? blockedMinutesWithin(input.blockingIntervals, { start: futureStart, end: planningHorizon })
    : 0;
  const physicalFutureMinutes = minutesBetween(futureStart, planningHorizon);
  const capacityBeforeBuffer = Math.max(0, Math.min(
    policy.maxUsableMinutes - elapsedMinutes - blockedMinutes,
    physicalFutureMinutes - blockedMinutes
  ));
  const planningBufferMinutes = Math.min(Math.max(0, input.planningBufferMinutes), capacityBeforeBuffer);
  return {
    ...policy,
    planningHorizon,
    elapsedMinutes,
    blockedMinutes,
    planningBufferMinutes,
    availableMinutes: capacityBeforeBuffer - planningBufferMinutes
  };
};
