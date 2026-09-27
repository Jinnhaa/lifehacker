import { zonedDateTimeToUtc } from "@amber/shared";
import { z } from "zod";
import { mergeIntervals } from "../morning/morning-planner.js";
import type { TimeInterval } from "../morning/morning.js";
import { getRemainingMinutes } from "../rules/duration.js";
import type { Task } from "../task/task.js";
import { isTerminalTaskStatus } from "../task/task.js";

export type FutureCapacityTask = Pick<Task, "id" | "status" | "plannedDate" | "internalDeadline" | "officialDeadline" | "estimatedUserMinutes" | "estimatedMinutes" | "actualMinutes">;
export interface FutureCapacityInput {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeZone: string;
  readonly now: Date;
  /** Known work windows from the caller's availability/work-until policy. [] means no work; absent/null means unknown. */
  readonly dailyAvailability: Readonly<Record<string, readonly TimeInterval[] | null>>;
  readonly constraints: readonly (TimeInterval & { readonly blocksCapacity: boolean })[];
  readonly planningBufferMinutes: number;
  readonly tasks: readonly FutureCapacityTask[];
}
export interface DailyFutureCapacity {
  readonly date: string;
  readonly grossCapacityMinutes: number | null;
  readonly blockedMinutes: number | null;
  readonly bufferMinutes: number | null;
  readonly availableMinutes: number | null;
  readonly committedWorkMinutes: number;
  readonly remainingMinutes: number | null;
  readonly unknownEffortTaskIds: readonly string[];
}
export interface FutureWorkloadEvidence {
  readonly taskId: string;
  readonly remainingMinutes: number | null;
  readonly plannedDate: string | null;
  readonly deadlineDate: string | null;
  readonly deadlineSource: "internal" | "official" | null;
}
export interface CapacityWindow {
  readonly startDate: string;
  readonly endDate: string;
  readonly availableMinutes: number | null;
  readonly knownRequiredWorkMinutes: number;
  readonly slackMinutes: number | null;
  readonly unknownCapacityDates: readonly string[];
  readonly unknownEffortTaskIds: readonly string[];
  readonly requiredTaskIds: readonly string[];
  readonly unplacedTaskIds: readonly string[];
}
export interface FutureCapacityProjection {
  readonly startDate: string;
  readonly endDate: string;
  readonly days: readonly DailyFutureCapacity[];
  readonly workload: readonly FutureWorkloadEvidence[];
  readonly deadlineWindows: readonly CapacityWindow[];
}

const minute = 60_000;
const nextDate = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const localDate = (value: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const read = (key: string) => parts.find((part) => part.type === key)!.value;
  return `${read("year")}-${read("month")}-${read("day")}`;
};
const validDate = (date: string): void => { z.iso.date().parse(date); };
const validInstant = (value: Date): void => { z.date().parse(value); };
const validMinutes = (value: number): void => { z.number().finite().nonnegative().parse(value); };
const validInterval = (value: TimeInterval): void => {
  validInstant(value.start); validInstant(value.end);
  if (value.end < value.start) throw new Error("Interval end precedes start");
};
const duration = (interval: TimeInterval) => (interval.end.getTime() - interval.start.getTime()) / minute;

/** Date-granular pressure, not a generated schedule. Unfinished past placements/deadlines remain carryover demand. */
export function projectCapacityWindow(projection: Pick<FutureCapacityProjection, "startDate" | "endDate" | "days" | "workload">, startDate: string, endDate: string): CapacityWindow {
  validDate(startDate); validDate(endDate);
  if (startDate > endDate || startDate < projection.startDate || endDate > projection.endDate) throw new Error("Window must be inside the projected horizon");
  const days = projection.days.filter((day) => day.date >= startDate && day.date <= endDate);
  // Include each task once, even if both its planned date and deadline are within the window.
  const required = projection.workload.filter((task) => (task.plannedDate !== null && task.plannedDate <= endDate)
    || (task.deadlineDate !== null && task.deadlineDate <= endDate));
  const unknownCapacityDates = days.filter((day) => day.availableMinutes === null).map((day) => day.date);
  const unplaced = projection.workload.filter((task) => task.plannedDate === null && task.deadlineDate === null);
  const unknownEffortTaskIds = [...required, ...unplaced].filter((task) => task.remainingMinutes === null).map((task) => task.taskId);
  const unplacedTaskIds = unplaced.map((task) => task.taskId);
  const availableMinutes = unknownCapacityDates.length ? null : days.reduce((sum, day) => sum + day.availableMinutes!, 0);
  const knownRequiredWorkMinutes = required.reduce((sum, task) => sum + (task.remainingMinutes ?? 0), 0);
  return { startDate, endDate, availableMinutes, knownRequiredWorkMinutes,
    slackMinutes: availableMinutes === null || unknownEffortTaskIds.length || unplacedTaskIds.length ? null : availableMinutes - knownRequiredWorkMinutes,
    unknownCapacityDates, unknownEffortTaskIds, requiredTaskIds: required.map((task) => task.taskId), unplacedTaskIds };
}

export function projectFutureCapacity(input: FutureCapacityInput): FutureCapacityProjection {
  validDate(input.startDate); validDate(input.endDate); validInstant(input.now); validMinutes(input.planningBufferMinutes);
  if (input.endDate < input.startDate) throw new Error("Horizon end precedes start");
  // Validate timezone even when no availability/deadlines are known.
  localDate(input.now, input.timeZone);
  input.constraints.forEach(validInterval);
  const ids = new Set<string>();
  const workload: FutureWorkloadEvidence[] = input.tasks.flatMap((task) => {
    if (ids.has(task.id)) throw new Error("Duplicate Task evidence");
    ids.add(task.id);
    if (isTerminalTaskStatus(task.status)) return [];
    validMinutes(task.actualMinutes);
    if (task.estimatedUserMinutes !== null) validMinutes(task.estimatedUserMinutes);
    if (task.estimatedMinutes !== null) validMinutes(task.estimatedMinutes);
    if (task.plannedDate) validDate(task.plannedDate);
    if (task.internalDeadline) validInstant(task.internalDeadline);
    if (task.officialDeadline) validInstant(task.officialDeadline);
    const internalFirst = task.internalDeadline !== null && (task.officialDeadline === null || task.internalDeadline <= task.officialDeadline);
    const deadline = internalFirst ? task.internalDeadline : task.officialDeadline;
    return [{ taskId: task.id, remainingMinutes: getRemainingMinutes(task.estimatedUserMinutes ?? task.estimatedMinutes, task.actualMinutes),
      plannedDate: task.plannedDate || null, deadlineDate: deadline ? localDate(deadline, input.timeZone) : null,
      deadlineSource: deadline ? internalFirst ? "internal" as const : "official" as const : null }];
  }).sort((a, b) => a.taskId.localeCompare(b.taskId));
  const days: DailyFutureCapacity[] = [];
  for (let date = input.startDate; date <= input.endDate; date = nextDate(date)) {
    const planned = workload.filter((task) => task.plannedDate === date);
    const committedWorkMinutes = planned.reduce((sum, task) => sum + (task.remainingMinutes ?? 0), 0);
    const unknownEffortTaskIds = planned.filter((task) => task.remainingMinutes === null).map((task) => task.taskId);
    const availability = input.dailyAvailability[date];
    let grossCapacityMinutes: number | null = null;
    let blockedMinutes: number | null = null;
    let bufferMinutes: number | null = null;
    let availableMinutes: number | null = null;
    if (availability !== null && availability !== undefined) {
      availability.forEach(validInterval);
      const horizon = { start: new Date(Math.max(zonedDateTimeToUtc(date, input.timeZone).getTime(), input.now.getTime())), end: zonedDateTimeToUtc(nextDate(date), input.timeZone) };
      const windows = mergeIntervals(availability, horizon);
      grossCapacityMinutes = Math.floor(windows.reduce((sum, window) => sum + duration(window), 0));
      blockedMinutes = Math.ceil(windows.reduce((sum, window) => sum + mergeIntervals(input.constraints.filter((constraint) => constraint.blocksCapacity), window).reduce((minutes, interval) => minutes + duration(interval), 0), 0));
      bufferMinutes = Math.min(input.planningBufferMinutes, Math.max(0, grossCapacityMinutes - blockedMinutes));
      availableMinutes = Math.max(0, grossCapacityMinutes - blockedMinutes - bufferMinutes);
    }
    days.push({ date, grossCapacityMinutes, blockedMinutes, bufferMinutes, availableMinutes, committedWorkMinutes,
      remainingMinutes: availableMinutes === null || unknownEffortTaskIds.length ? null : availableMinutes - committedWorkMinutes, unknownEffortTaskIds });
  }
  const projection = { startDate: input.startDate, endDate: input.endDate, days, workload };
  const deadlineDates = [...new Set(workload.flatMap((task) => task.deadlineDate && task.deadlineDate <= input.endDate ? [task.deadlineDate < input.startDate ? input.startDate : task.deadlineDate] : []))].sort();
  return { ...projection, deadlineWindows: deadlineDates.map((date) => projectCapacityWindow(projection, input.startDate, date)) };
}
