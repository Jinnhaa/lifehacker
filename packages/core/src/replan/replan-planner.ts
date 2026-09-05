import { zonedDateTimeToUtc } from "@amber/shared";
import { createMorningPlan } from "../morning/morning-planner.js";
import type { MorningObservation, MorningPlanDraft, TimeInterval } from "../morning/morning.js";
import type { BuildReplanDraftInput } from "./replan.js";

const MINUTE = 60_000;
const inactiveStatuses = new Set(["completed", "blocked", "switched", "skipped", "cancelled"]);

const minutes = (start: Date, end: Date): number => Math.max(0, Math.floor((end.getTime() - start.getTime()) / MINUTE));

const localWeekday = (value: Date, timeZone: string): number => {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as const)[label as "Mon"] ?? 1;
};

export const resolveReplanWorkUntil = (observation: MorningObservation, previous: BuildReplanDraftInput["previous"]): Date => {
  const configured = observation.planningPolicy.defaultWorkUntil ?? observation.planningPolicy.workUntil;
  return typeof configured === "string" && /^\d{2}:\d{2}$/.test(configured)
    ? zonedDateTimeToUtc(`${previous.planDate}T${configured}:00`, previous.timeZone)
    : previous.workUntil;
};

const subtractIntervals = (source: TimeInterval, occupied: readonly TimeInterval[]): TimeInterval[] => {
  let result: TimeInterval[] = [source];
  for (const blocked of occupied) {
    result = result.flatMap((value) => {
      if (blocked.end <= value.start || blocked.start >= value.end) return [value];
      const pieces: TimeInterval[] = [];
      if (blocked.start > value.start) pieces.push({ start: value.start, end: blocked.start });
      if (blocked.end < value.end) pieces.push({ start: blocked.end, end: value.end });
      return pieces;
    });
  }
  return result;
};

export const buildReplanDraft = (input: BuildReplanDraftInput): MorningPlanDraft => {
  const { observation, previous, now } = input;
  const workUntil = resolveReplanWorkUntil(observation, previous);
  const remaining = previous.items.filter((item) => item.end > now && !inactiveStatuses.has(item.status));
  const unavailableTaskIds = new Set(previous.items.flatMap((item) =>
    item.taskId && (item.status === "blocked" || item.status === "switched" || item.taskStatus === "BLOCKED")
      && item.taskId !== previous.activeTaskId ? [item.taskId] : []));
  let tasks = observation.tasks.filter((task) => !unavailableTaskIds.has(task.id));

  if (previous.activeTaskId) {
    const active = tasks.find((task) => task.id === previous.activeTaskId);
    const oldMinutes = remaining.filter((item) => item.taskId === previous.activeTaskId)
      .reduce((sum, item) => sum + minutes(new Date(Math.max(item.start.getTime(), now.getTime())), item.end), 0);
    if (active && (active.estimatedUserMinutes ?? active.estimatedMinutes ?? 0) - active.actualMinutes <= 0 && oldMinutes > 0) {
      tasks = tasks.map((task) => task.id === active.id
        ? { ...task, estimatedUserMinutes: task.actualMinutes + oldMinutes }
        : task);
    }
  }

  const remainingBuffers = remaining.filter((item) => item.itemType === "buffer")
    .reduce((sum, item) => sum + minutes(new Date(Math.max(item.start.getTime(), now.getTime())), item.end), 0);
  const maximumWorkMinutes = remaining.filter((item) => item.itemType === "task" || item.itemType === "routine")
    .reduce((sum, item) => sum + minutes(new Date(Math.max(item.start.getTime(), now.getTime())), item.end), 0);
  const protectedIntervals = observation.constraints.filter((value) => value.blocksCapacity)
    .map((value) => ({ start: value.start, end: value.end }));
  const restItems = remaining.filter((item) => item.itemType === "rest").flatMap((item) =>
    subtractIntervals({ start: new Date(Math.max(item.start.getTime(), now.getTime())), end: new Date(Math.min(item.end.getTime(), workUntil.getTime())) }, protectedIntervals)
      .filter((value) => value.end > value.start)
      .map((value) => ({
        itemType: "rest" as const,
        title: item.title,
        plannedMinutes: minutes(value.start, value.end),
        start: value.start,
        end: value.end
      })));
  const restIntervals = restItems.map((item) => ({ start: item.start, end: item.end }));
  const adjusted: MorningObservation = {
    ...observation,
    tasks,
    planningBufferMinutes: Math.max(observation.planningBufferMinutes, remainingBuffers)
  };
  const planned = createMorningPlan({
    observation: adjusted,
    now,
    workUntil,
    privateIntervals: [...previous.privateIntervals, ...restIntervals],
    localWeekday: localWeekday(now, previous.timeZone),
    maximumWorkMinutes
  });
  return {
    ...planned,
    items: [...planned.items, ...restItems].sort((left, right) => left.start.getTime() - right.start.getTime()),
    inputSnapshot: {
      ...planned.inputSnapshot,
      previousPlanId: previous.planId,
      previousRevisionNo: previous.revisionNo
    }
  };
};
