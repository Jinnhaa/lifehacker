import { calculateRecurringActivityRisk, type RecurringActivityRisk } from "../rules/recurring-activity.js";
import { getDaysUntilDeadline } from "../rules/deadline.js";
import type {
  MorningObservation,
  MorningPlanDraft,
  MorningPlanItemDraft,
  MorningRecurringActivity,
  TimeInterval
} from "./morning.js";

const MINUTE = 60_000;

interface Candidate {
  readonly type: "task" | "routine";
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
  readonly minimumMinutes: number;
  readonly rank: number;
  readonly importance: number;
  readonly deadline: Date | null;
  readonly risk?: RecurringActivityRisk;
}

const minutesBetween = (interval: TimeInterval): number =>
  Math.max(0, Math.floor((interval.end.getTime() - interval.start.getTime()) / MINUTE));

const mergeIntervals = (intervals: readonly TimeInterval[], horizon: TimeInterval): TimeInterval[] => {
  const clipped = intervals
    .map((value) => ({
      start: new Date(Math.max(value.start.getTime(), horizon.start.getTime())),
      end: new Date(Math.min(value.end.getTime(), horizon.end.getTime()))
    }))
    .filter((value) => value.end > value.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: TimeInterval[] = [];
  for (const value of clipped) {
    const previous = merged.at(-1);
    if (!previous || value.start > previous.end) merged.push(value);
    else if (value.end > previous.end) merged[merged.length - 1] = { start: previous.start, end: value.end };
  }
  return merged;
};

const freeIntervals = (horizon: TimeInterval, occupied: readonly TimeInterval[]): TimeInterval[] => {
  const free: TimeInterval[] = [];
  let cursor = horizon.start;
  for (const interval of mergeIntervals(occupied, horizon)) {
    if (interval.start > cursor) free.push({ start: cursor, end: interval.start });
    if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor < horizon.end) free.push({ start: cursor, end: horizon.end });
  return free;
};

const containsId = (value: unknown, id: string): boolean => {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((entry) => containsId(entry, id));
  if (value && typeof value === "object") return Object.values(value).some((entry) => containsId(entry, id));
  return false;
};

const remainingSuitableDays = (activity: MorningRecurringActivity, localWeekday: number): number => {
  const days = activity.preferredDays;
  if (!days || days.length === 0) return 8 - localWeekday;
  return days.filter((day) => day >= localWeekday).length;
};

const buildCandidates = (observation: MorningObservation, now: Date, localWeekday: number): Candidate[] => {
  const directiveOrders = observation.strategicDirectives.map((value) => value.priorityOrder);
  const tasks: Candidate[] = observation.tasks.flatMap((task) => {
    if (task.status === "DONE" || task.status === "BLOCKED" || task.status === "WAITING_FOR_USER") return [];
    const minutes = Math.max((task.estimatedUserMinutes ?? task.estimatedMinutes ?? 0) - task.actualMinutes, 0);
    if (minutes === 0) return [];
    const deadlines = [task.officialDeadline, task.internalDeadline].filter((value): value is Date => value !== null);
    const deadline = deadlines.length > 0 ? new Date(Math.min(...deadlines.map((value) => value.getTime()))) : null;
    const days = getDaysUntilDeadline(deadline, now, observation.timeZone);
    const deadlineRank = days !== null && days < 0 ? 0 : days === 0 ? 1 : days !== null && days <= 3 ? 3 : 5;
    const directed = directiveOrders.some((order) => containsId(order, task.id));
    return [{
      type: "task" as const,
      id: task.id,
      title: task.title,
      minutes,
      minimumMinutes: Math.min(minutes, 30),
      rank: directed ? Math.max(0, deadlineRank - 1) : deadlineRank,
      importance: task.importance,
      deadline
    }];
  });
  const routines: Candidate[] = observation.recurringActivities.flatMap((activity) => {
    const result = calculateRecurringActivityRisk({
      targetCount: activity.targetCount,
      completedCount: activity.completedCount,
      remainingSuitableDays: remainingSuitableDays(activity, localWeekday)
    });
    if (result.remainingCount === 0 || result.risk === "LOW") return [];
    return [{
      type: "routine" as const,
      id: activity.id,
      title: activity.title,
      minutes: activity.expectedMinutes,
      minimumMinutes: activity.minimumMinutes ?? activity.expectedMinutes,
      rank: result.risk === "HIGH" ? 2 : 4,
      importance: activity.importance,
      deadline: null,
      risk: result.risk
    }];
  });
  return [...tasks, ...routines].sort((a, b) =>
    a.rank - b.rank
    || b.importance - a.importance
    || (a.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER)
    || a.title.localeCompare(b.title)
  );
};

const allocate = (
  intervals: TimeInterval[],
  candidate: Candidate,
  maximumMinutes: number
): { items: MorningPlanItemDraft[]; used: number } => {
  const available = intervals.reduce((sum, value) => sum + minutesBetween(value), 0);
  const target = Math.min(candidate.minutes, maximumMinutes, available);
  if (target < candidate.minimumMinutes) return { items: [], used: 0 };
  const items: MorningPlanItemDraft[] = [];
  let remaining = target;
  while (remaining > 0 && intervals.length > 0) {
    const interval = intervals[0]!;
    const used = Math.min(remaining, minutesBetween(interval));
    if (used <= 0) { intervals.shift(); continue; }
    const end = new Date(interval.start.getTime() + used * MINUTE);
    items.push({
      itemType: candidate.type,
      title: candidate.title,
      plannedMinutes: used,
      start: interval.start,
      end,
      ...(candidate.type === "task" ? { taskId: candidate.id } : { recurringActivityId: candidate.id })
    });
    remaining -= used;
    if (end >= interval.end) intervals.shift();
    else intervals[0] = { start: end, end: interval.end };
  }
  return { items, used: target - remaining };
};

export interface CreateMorningPlanInput {
  readonly observation: MorningObservation;
  readonly now: Date;
  readonly workUntil: Date;
  readonly privateIntervals: readonly TimeInterval[];
  readonly localWeekday: number;
  readonly maximumWorkMinutes?: number;
}

export const createMorningPlan = (input: CreateMorningPlanInput): MorningPlanDraft => {
  const start = new Date(Math.ceil(input.now.getTime() / (5 * MINUTE)) * 5 * MINUTE);
  const horizon = { start, end: input.workUntil };
  const fixedEvents = input.observation.constraints.filter((value) => value.blocksCapacity && value.end > start && value.start < input.workUntil);
  const intervals = input.workUntil > start
    ? freeIntervals(horizon, [...fixedEvents, ...input.privateIntervals])
    : [];
  const availableMinutes = intervals.reduce((sum, value) => sum + minutesBetween(value), 0);
  const bufferMinutes = Math.min(input.observation.planningBufferMinutes, availableMinutes);
  let workBudget = Math.min(availableMinutes - bufferMinutes, input.maximumWorkMinutes ?? Number.MAX_SAFE_INTEGER);
  const items: MorningPlanItemDraft[] = [];
  const candidates = buildCandidates(input.observation, input.now, input.localWeekday);
  for (const candidate of candidates) {
    if (workBudget <= 0) break;
    const allocated = allocate(intervals, candidate, workBudget);
    items.push(...allocated.items);
    workBudget -= allocated.used;
  }
  if (bufferMinutes > 0) {
    const buffer: Candidate = { type: "task", id: "", title: "버퍼", minutes: bufferMinutes, minimumMinutes: 1, rank: 0, importance: 1, deadline: null };
    const allocated = allocate(intervals, buffer, bufferMinutes);
    items.push(...allocated.items.map((item) => ({
      itemType: "buffer" as const,
      title: item.title,
      plannedMinutes: item.plannedMinutes,
      start: item.start,
      end: item.end
    })));
  }
  items.sort((a, b) => a.start.getTime() - b.start.getTime());

  const highlights: string[] = [];
  const urgent = candidates.find((value) => value.type === "task" && value.rank <= 1);
  if (urgent) highlights.push(`${urgent.title}: 마감 우선`);
  const routine = candidates.find((value) => value.type === "routine");
  if (routine) {
    const source = input.observation.recurringActivities.find((value) => value.id === routine.id)!;
    highlights.push(`${routine.title}: 이번 주 ${Math.max(source.targetCount - source.completedCount, 0)}회 남음`);
  }
  return {
    items,
    fixedEvents,
    highlights,
    inputSnapshot: {
      observedAt: input.now.toISOString(),
      planningBufferMinutes: input.observation.planningBufferMinutes,
      constraintIds: input.observation.constraints.map((value) => value.id),
      taskIds: input.observation.tasks.map((value) => value.id),
      recurringActivityIds: input.observation.recurringActivities.map((value) => value.id),
      strategicDirectiveIds: input.observation.strategicDirectives.map((value) => value.id),
      workUntil: input.workUntil.toISOString(),
      privateIntervals: input.privateIntervals.map((value) => ({ start: value.start.toISOString(), end: value.end.toISOString() }))
    }
  };
};
