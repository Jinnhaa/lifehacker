import { calendarDayDifference } from "@amber/shared";

export const getDaysUntilDeadline = (deadline: Date | null, now: Date, timeZone: string): number | null =>
  deadline ? calendarDayDifference(deadline, now, timeZone) : null;

export const isDueToday = (deadline: Date | null, now: Date, timeZone: string): boolean =>
  getDaysUntilDeadline(deadline, now, timeZone) === 0;

export const isOverdue = (deadline: Date | null, now: Date): boolean => deadline !== null && deadline.getTime() < now.getTime();

export const isDueWithin = (deadline: Date | null, days: number, now: Date, timeZone: string): boolean => {
  if (days < 0) return false;
  const remaining = getDaysUntilDeadline(deadline, now, timeZone);
  return remaining !== null && remaining >= 0 && remaining <= days;
};
