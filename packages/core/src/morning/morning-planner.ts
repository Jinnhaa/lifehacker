import { calculateRecurringActivityRisk, type RecurringActivityRisk } from "../rules/recurring-activity.js";
import { getDaysUntilDeadline } from "../rules/deadline.js";
import { isTaskOverdue } from "../rules/task-overdue.js";
import { applyApprovedPrinciples } from "../principle-application/principle-application.js";
import type { Task } from "../task/task.js";
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
  readonly workload?: TaskWorkload;
  readonly courseStudy?: MorningRecurringActivity["courseStudy"];
}

export interface TaskWorkload {
  readonly remainingMinutes: number;
  readonly targetDeadline: Date | null;
  readonly targetSource: "internal" | "official_default" | "none";
  readonly todayRequiredMinutes: number;
  readonly weekRequiredMinutes: number;
}

const DAY = 86_400_000;

export const calculateTaskWorkload = (
  task: Task,
  now: Date,
  timeZone: string,
  localWeekday: number
): TaskWorkload => {
  const remainingMinutes = Math.max((task.estimatedUserMinutes ?? task.estimatedMinutes ?? 0) - task.actualMinutes, 0);
  let targetDeadline: Date | null = task.internalDeadline;
  let targetSource: TaskWorkload["targetSource"] = targetDeadline ? "internal" : "none";
  if (targetDeadline && task.officialDeadline && targetDeadline > task.officialDeadline) {
    const officialDays = getDaysUntilDeadline(task.officialDeadline, now, timeZone) ?? 0;
    const leadDays = officialDays >= 2 ? 2 : officialDays >= 1 ? 1 : 0;
    targetDeadline = new Date(task.officialDeadline.getTime() - leadDays * DAY);
    targetSource = "official_default";
  } else if (!targetDeadline && task.officialDeadline) {
    const officialDays = getDaysUntilDeadline(task.officialDeadline, now, timeZone) ?? 0;
    const leadDays = officialDays >= 2 ? 2 : officialDays >= 1 ? 1 : 0;
    targetDeadline = new Date(task.officialDeadline.getTime() - leadDays * DAY);
    targetSource = "official_default";
  }
  const targetDays = getDaysUntilDeadline(targetDeadline, now, timeZone);
  const planningDays = targetDays === null ? 1 : Math.max(1, targetDays + 1);
  const todayRequiredMinutes = remainingMinutes === 0 ? 0 : Math.ceil(remainingMinutes / planningDays);
  const daysRemainingThisWeek = Math.max(1, 8 - localWeekday);
  const weekRequiredMinutes = Math.min(remainingMinutes, todayRequiredMinutes * Math.min(planningDays, daysRemainingThisWeek));
  return { remainingMinutes, targetDeadline, targetSource, todayRequiredMinutes, weekRequiredMinutes };
};

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
    if (task.status === "DONE" || task.status === "BLOCKED" || task.status === "WAITING_FOR_USER"
      || isTaskOverdue(task, now, observation.timeZone)) return [];
    const workload = calculateTaskWorkload(task, now, observation.timeZone, localWeekday);
    if (workload.remainingMinutes === 0) return [];
    const minutes = workload.todayRequiredMinutes;
    const deadline = workload.targetDeadline;
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
      deadline,
      workload
    }];
  });
  const routines: Candidate[] = observation.recurringActivities.flatMap((activity) => {
    const result = calculateRecurringActivityRisk({
      targetCount: activity.targetCount,
      completedCount: activity.completedCount,
      remainingSuitableDays: remainingSuitableDays(activity, localWeekday)
    });
    if (result.remainingCount === 0 || (!activity.courseStudy && result.risk === "LOW")) return [];
    const minutes = activity.courseStudy?.todayMinutes ?? activity.expectedMinutes;
    return [{
      type: "routine" as const,
      id: activity.id,
      title: activity.title,
      minutes,
      minimumMinutes: activity.courseStudy ? Math.min(minutes, activity.minimumMinutes ?? 15) : activity.minimumMinutes ?? activity.expectedMinutes,
      rank: activity.courseStudy?.priorityRank ?? (result.risk === "HIGH" ? 2 : 4),
      importance: activity.importance,
      deadline: null,
      risk: result.risk,
      ...(activity.courseStudy ? { courseStudy: activity.courseStudy } : {})
    }];
  });
  return [...tasks, ...routines].sort((left, right) =>
    left.rank - right.rank
    || (left.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER)
    || right.importance - left.importance
    || left.title.localeCompare(right.title, "ko-KR"));
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
  const taskAllocations = new Map<string, number>();
  const principleResult = applyApprovedPrinciples(
    buildCandidates(input.observation, input.now, input.localWeekday),
    input.observation.principles ?? [],
    input.now,
    input.observation.timeZone
  );
  const orderedTasks = principleResult.candidates.filter(c=>c.type==='task').sort((a,b)=>
    (input.observation.chiefTaskOrder?.indexOf(a.id) ?? -1) - (input.observation.chiefTaskOrder?.indexOf(b.id) ?? -1));
  let taskIndex = 0;
  const candidates = input.observation.chiefTaskOrder
    ? principleResult.candidates.map(c=>c.type==='task' ? orderedTasks[taskIndex++]! : c)
    : principleResult.candidates;
  for (const candidate of candidates) {
    if (workBudget <= 0) break;
    const allocated = allocate(intervals, candidate, workBudget);
    items.push(...allocated.items);
    if (candidate.type === "task") taskAllocations.set(candidate.id, allocated.used);
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
  const deadlineRisks = candidates.filter((value) => value.type === "task" && value.workload
    && (taskAllocations.get(value.id) ?? 0) < value.workload.todayRequiredMinutes);
  for (const candidate of deadlineRisks) {
    highlights.push(`${candidate.title}: 마감 위험 · 오늘 필요 ${candidate.workload!.todayRequiredMinutes}분 / 배치 ${taskAllocations.get(candidate.id) ?? 0}분`);
  }
  const urgent = candidates.find((value) => value.type === "task" && value.rank <= 1);
  if (urgent) highlights.push(`${urgent.title}: 마감 우선`);
  const routine = candidates.find((value) => value.type === "routine");
  if (routine) {
    const source = input.observation.recurringActivities.find((value) => value.id === routine.id)!;
    highlights.push(`${routine.title}: 이번 주 ${Math.max(source.targetCount - source.completedCount, 0)}회 남음`);
  }
  if (principleResult.explanation) highlights.push(principleResult.explanation);
  for (const candidate of candidates.filter((value) => value.type === "routine" && value.courseStudy)) {
    const planned = items.filter((item) => item.recurringActivityId === candidate.id).reduce((sum, item) => sum + item.plannedMinutes, 0);
    if (planned < candidate.courseStudy!.todayMinutes) {
      highlights.push(`${candidate.title}: 학습량 미배치 · 오늘 추천 ${candidate.courseStudy!.todayMinutes}분 / 배치 ${planned}분`);
    }
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
      usedPrincipleIds: principleResult.usedPrincipleIds,
      carryoverSourceDate: input.observation.carryoverContext?.sourceDate ?? null,
      carryoverTaskIds: input.observation.carryoverContext?.taskIds ?? [],
      workload: candidates.flatMap((candidate) => candidate.type === "task" && candidate.workload ? [{
        taskId: candidate.id,
        remainingMinutes: candidate.workload.remainingMinutes,
        targetDeadline: candidate.workload.targetDeadline?.toISOString() ?? null,
        targetSource: candidate.workload.targetSource,
        todayRequiredMinutes: candidate.workload.todayRequiredMinutes,
        weekRequiredMinutes: candidate.workload.weekRequiredMinutes,
        plannedMinutes: taskAllocations.get(candidate.id) ?? 0,
        deadlineRisk: (taskAllocations.get(candidate.id) ?? 0) < candidate.workload.todayRequiredMinutes
      }] : []),
      courseStudyWorkload: candidates.flatMap((candidate) => candidate.type === "routine" && candidate.courseStudy ? [{
        recurringActivityId: candidate.id,
        workContextId: candidate.courseStudy.workContextId,
        weeklyMinutes: candidate.courseStudy.weeklyMinutes,
        todayMinutes: candidate.courseStudy.todayMinutes,
        plannedMinutes: items.filter((item) => item.recurringActivityId === candidate.id).reduce((sum, item) => sum + item.plannedMinutes, 0),
        priorityRank: candidate.courseStudy.priorityRank,
        reasons: candidate.courseStudy.reasons,
        signals: candidate.courseStudy.signals
      }] : []),
      workUntil: input.workUntil.toISOString(),
      privateIntervals: input.privateIntervals.map((value) => ({ start: value.start.toISOString(), end: value.end.toISOString() }))
    }
  };
};
