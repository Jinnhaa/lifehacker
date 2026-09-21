import "server-only";

import {
  SupabaseMorningRepository,
  SupabaseTaskRepository,
  TaskService,
  deriveCurrentStatus,
  comparePriorityBands,
  projectPlannedDay,
  projectGoalProgress
} from "@amber/core";
import { DeterministicTestInterpreter, InputService, SupabaseInputRepository } from "@amber/input";
import { SystemClock, zonedDateTimeToUtc, type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { getWebSql, getWebUserId } from "./web-runtime";
import type { WorkBoardViewModel, WorkCalendarEvent, WorkMonthDay, WorkTaskItem, WorkTodayQuest } from "./work-types";

type TaskRow = {
  id: string; title: string; status: string; planned_date: string | null; official_deadline: Date | null;
  internal_deadline: Date | null; estimated_minutes: number | null; estimated_user_minutes: number | null;
  actual_minutes: number; work_context_id: string | null; context_title: string | null; context_kind: "project" | "course" | null;
  objective_id: string | null; goal_id: string | null; goal_title: string | null;
  goal_level: "LONG_TERM" | "MONTHLY" | "WEEKLY" | null; plan_date: string | null;
};
type GoalRow = {
  id: string; title: string; level: "LONG_TERM" | "MONTHLY" | "WEEKLY"; parent_goal_id: string | null;
  period_start: string | null; period_end: string | null; status: string;
};
type ObjectiveRow = { id: string; goal_id: string; title: string; target_date: string | null; status: string; success_criteria: string | null };
type EventRow = { id: string; title: string | null; valid_from: Date; valid_until: Date; value: unknown };

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
};
const localDate = (date: Date, timeZone: string): string => new Intl.DateTimeFormat("en-CA", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit"
}).format(date);
const mondayFor = (date: string): string => {
  const value = new Date(`${date}T12:00:00.000Z`); const day = value.getUTCDay() || 7; return addDays(date, 1 - day);
};
const monthGridDates = (today: string): string[] => {
  const first = `${today.slice(0, 7)}-01`; const start = mondayFor(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};
const deadlineLabel = (value: Date | null, timeZone: string): string | null => value ? new Intl.DateTimeFormat("ko-KR", {
  timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(value) : null;
const inputDateTime = (value: Date | null, timeZone: string): string => {
  if (!value) return "";
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
};
const timeLabel = (start: Date, end: Date, timeZone: string): string => `${new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(start)}–${new Intl.DateTimeFormat("ko-KR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(end)}`;

const readTasks = (sql: Sql, userId: UserId): Promise<TaskRow[]> => sql<TaskRow[]>`
  select t.id,t.title,t.status,t.planned_date::text,t.official_deadline,t.internal_deadline,t.estimated_minutes,
    t.estimated_user_minutes,t.actual_minutes,coalesce(t.work_context_id,o.work_context_id) work_context_id,
    w.title context_title,w.kind context_kind,t.objective_id,g.id goal_id,g.title goal_title,g.level goal_level,
    plan.plan_date::text
  from public.tasks t
  left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
  left join public.goals g on g.id=o.goal_id and g.user_id=o.user_id
  left join public.work_contexts w on w.id=coalesce(t.work_context_id,o.work_context_id) and w.user_id=t.user_id
  left join lateral (
    select p.plan_date from public.plan_items i join public.daily_plans p on p.id=i.daily_plan_id and p.user_id=i.user_id
    where i.user_id=t.user_id and i.task_id=t.id and p.status='approved' and i.status<>'completed'
    order by p.plan_date desc limit 1
  ) plan on true
  where t.user_id=${userId}
  order by t.created_at`;

const readEvents = async (sql: Sql, userId: UserId, start: Date, end: Date, timeZone: string): Promise<WorkCalendarEvent[]> => {
  const rows = await sql<EventRow[]>`
    select c.id,coalesce(c.value->>'title','고정 일정') title,c.valid_from,c.valid_until,c.value
    from public.constraints c join public.external_references r on r.internal_entity_id=c.id and r.user_id=c.user_id
    where c.user_id=${userId} and c.constraint_type='availability' and c.valid_from<${end} and c.valid_until>${start}
      and coalesce(c.value->>'blocksCapacity','false')='true' and coalesce(c.value->>'syncStatus','active')='active'
      and r.external_type='calendar_event' and r.ownership='external' and r.sync_status='active'
    order by c.valid_from`;
  return rows.map((row) => ({
    id: row.id, title: row.title ?? "고정 일정", date: localDate(row.valid_from, timeZone),
    startsAt: row.valid_from.toISOString(), endsAt: row.valid_until.toISOString(), timeLabel: timeLabel(row.valid_from, row.valid_until, timeZone),
    major: /시험|quiz|exam|발표|행사|약속|면접|회의/i.test(row.title ?? "") || record(row.value).major === true
  }));
};

export const readWorkBoard = async (sql: Sql, userId: UserId, timeZone: string, now = new Date()): Promise<WorkBoardViewModel> => {
  const today = localDate(now, timeZone); const weekStart = mondayFor(today); const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthDates = monthGridDates(today); const rangeStart = zonedDateTimeToUtc(`${monthDates[0]}T00:00:00`, timeZone);
  const rangeEnd = zonedDateTimeToUtc(`${addDays(monthDates[41]!, 1)}T00:00:00`, timeZone);
  const inputRepository = new SupabaseInputRepository(sql);
  const [pending, taskRows, contexts, goals, objectives, events, observation, todayPlan] = await Promise.all([
    inputRepository.listPendingTaskConfirmations(userId), readTasks(sql, userId), inputRepository.getContextCandidates(userId),
    sql<GoalRow[]>`select id,title,level,parent_goal_id,period_start::text,period_end::text,status from public.goals where user_id=${userId} and status='active' order by level,created_at`,
    sql<ObjectiveRow[]>`select id,goal_id,title,target_date::text,status,success_criteria from public.objectives where user_id=${userId} and goal_id is not null and status<>'cancelled'`,
    readEvents(sql, userId, rangeStart, rangeEnd, timeZone),
    new SupabaseMorningRepository(sql).loadObservation(userId, today, timeZone),
    sql<{ input_snapshot: unknown }[]>`select input_snapshot from public.daily_plans where user_id=${userId} and plan_date=${today} and status='approved' order by revision_no desc limit 1`
  ]);
  const planSnapshot = record(todayPlan[0]?.input_snapshot); const workUntil = typeof planSnapshot.workUntil === "string" ? new Date(planSnapshot.workUntil) : null;
  const occupied = observation.constraints.filter((item) => item.blocksCapacity && item.end > now && (!workUntil || item.start < workUntil))
    .reduce((sum, item) => sum + Math.max(0, Math.min(item.end.getTime(), workUntil?.getTime() ?? item.end.getTime()) - Math.max(item.start.getTime(), now.getTime())) / 60_000, 0);
  const capacity = workUntil && workUntil > now ? Math.max(0, Math.floor((workUntil.getTime() - now.getTime()) / 60_000 - occupied - observation.planningBufferMinutes)) : null;
  const currentStatus = deriveCurrentStatus({ observation, now, planDate: today, remainingCapacityMinutes: capacity });
  const priority = new Map(currentStatus.priorities.flatMap((item) => item.taskId ? [[item.taskId, item.band] as const] : []));
  const projections = new Map(projectGoalProgress({
    goals: goals.map((goal) => ({ id: goal.id, title: goal.title, level: goal.level, parentGoalId: goal.parent_goal_id, periodStart: goal.period_start, periodEnd: goal.period_end, status: goal.status })),
    objectives: objectives.map((objective) => ({ id: objective.id, goalId: objective.goal_id, status: objective.status, successCriteria: objective.success_criteria })),
    tasks: taskRows.map((task) => ({ id: task.id, objectiveId: task.objective_id, status: task.status, estimatedMinutes: task.estimated_minutes, estimatedUserMinutes: task.estimated_user_minutes, actualMinutes: task.actual_minutes }))
  }).map((projection) => [projection.goalId, projection] as const));
  const suggestedDate = (row: TaskRow): { date: string; source: WorkTaskItem["plannedDateSource"] } => projectPlannedDay({
    plannedDate: row.planned_date, approvedPlanDate: row.plan_date,
    internalDeadlineDate: row.internal_deadline ? localDate(row.internal_deadline, timeZone) : null,
    officialDeadlineDate: row.official_deadline ? localDate(row.official_deadline, timeZone) : null,
    priorityBand: priority.get(row.id) ?? null
  }, today);
  const tasks: WorkTaskItem[] = taskRows.filter((row) => row.status !== "DONE").map((row) => {
    const planned = suggestedDate(row);
    return {
      id: row.id, title: row.title, status: row.status, plannedDate: planned.date, plannedDateSource: planned.source,
      officialDeadline: row.official_deadline?.toISOString() ?? null, internalDeadline: row.internal_deadline?.toISOString() ?? null,
      internalDeadlineInput: inputDateTime(row.internal_deadline, timeZone),
      officialDeadlineLabel: deadlineLabel(row.official_deadline, timeZone), internalDeadlineLabel: deadlineLabel(row.internal_deadline, timeZone),
      estimatedMinutes: row.estimated_user_minutes ?? row.estimated_minutes, workContextId: row.work_context_id,
      contextTitle: row.context_title, contextKind: row.context_kind, goalId: row.goal_id, goalTitle: row.goal_title,
      goalLevel: row.goal_level, priorityBand: priority.get(row.id) ?? null
    };
  }).sort((left, right) => {
    return comparePriorityBands(left.priorityBand, right.priorityBand)
      || (left.officialDeadline ?? left.internalDeadline ?? "z").localeCompare(right.officialDeadline ?? right.internalDeadline ?? "z");
  });
  const wins = goals.flatMap((goal) => {
    const projection = projections.get(goal.id); if (!projection || (goal.level !== "WEEKLY" && goal.level !== "MONTHLY")) return [];
    if ((goal.period_start && goal.period_start > today) || (goal.period_end && goal.period_end < today)) return [];
    return [{ id: goal.id, title: goal.title, level: goal.level, progress: projection.progress, remainingMinutes: projection.remainingMinutes }];
  });
  const todayTasks = tasks.filter((task) => task.plannedDate === today);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const prioritizedQuests: WorkTodayQuest[] = [];
  for (const item of currentStatus.priorities) {
    if (item.taskId) {
      const task = taskById.get(item.taskId);
      if (task?.plannedDate === today) prioritizedQuests.push({ id: task.id, kind: "task", task, title: task.title, estimatedMinutes: task.estimatedMinutes, contextTitle: task.contextTitle, priorityBand: task.priorityBand });
      continue;
    }
    if (item.kind === "course_study") prioritizedQuests.push({ id: item.id, kind: "course_study", task: null, title: item.title, estimatedMinutes: item.minutes, contextTitle: observation.recurringActivities.find((activity) => activity.id === item.recurringActivityId)?.title ?? null, priorityBand: item.band });
  }
  const priorityIds = new Set(prioritizedQuests.filter((quest) => quest.kind === "task").map((quest) => quest.id));
  const todayQuests: WorkTodayQuest[] = [...prioritizedQuests, ...todayTasks.filter((task) => !priorityIds.has(task.id)).map((task) => ({
    id: task.id, kind: "task" as const, task, title: task.title, estimatedMinutes: task.estimatedMinutes, contextTitle: task.contextTitle, priorityBand: task.priorityBand
  }))];
  const assessments = currentStatus.assessments.map((assessment) => ({ id: `assessment:${assessment.workContextId}:${assessment.type}`, title: assessment.title, date: localDate(new Date(assessment.dueAt), timeZone), kind: "assessment" as const }));
  const month: WorkMonthDay[] = monthDates.map((date) => {
    const highlights: Array<WorkMonthDay["highlights"][number]> = [];
    for (const task of tasks) {
      if (task.officialDeadline && localDate(new Date(task.officialDeadline), timeZone) === date) {
        highlights.push({ id: `official:${task.id}`, title: task.title, kind: "official" });
      } else if (task.internalDeadline && localDate(new Date(task.internalDeadline), timeZone) === date && (task.priorityBand === "P2" || task.goalId)) {
        highlights.push({ id: `internal:${task.id}`, title: task.title, kind: "internal" });
      }
    }
    highlights.push(...assessments.filter((item) => item.date === date));
    highlights.push(...objectives.filter((objective) => objective.target_date === date && Boolean(objective.success_criteria?.trim()))
      .map((objective) => ({ id: `milestone:${objective.id}`, title: objective.title, kind: "milestone" as const })));
    highlights.push(...events.filter((event) => event.date === date && event.major)
      .map((event) => ({ id: `event:${event.id}`, title: event.title, kind: "event" as const })));
    return {
      date, dayNumber: Number(date.slice(-2)), inMonth: date.slice(0, 7) === today.slice(0, 7), isToday: date === today,
      highlights: highlights.slice(0, 4)
    };
  });
  const contextById = new Map(contexts.workContexts.map((context) => [context.id, context]));
  return {
    configured: true, error: null, timeZone, today,
    monthLabel: new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone }).format(now),
    weeklyWins: wins.filter((goal) => goal.level === "WEEKLY"), monthlyWins: wins.filter((goal) => goal.level === "MONTHLY"),
    week: weekDates.map((date) => ({
      date, dayLabel: new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(new Date(`${date}T12:00:00Z`)),
      dateLabel: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`, isToday: date === today,
      tasks: tasks.filter((task) => task.plannedDate === date), events: events.filter((event) => event.date === date)
    })),
    todayTasks, todayQuests, todayEvents: events.filter((event) => event.date === today), todayCapacityMinutes: capacity,
    todayWorkloadMinutes: todayQuests.reduce((sum, quest) => sum + (quest.estimatedMinutes ?? 0), 0),
    deadlineWarning: currentStatus.officialDueToday.length ? `오늘 공식 마감 미완료 ${currentStatus.officialDueToday.length}개` : null,
    month, unplannedTasks: tasks.filter((task) => !weekDates.includes(task.plannedDate)),
    candidates: pending.map((candidate) => {
      const contextId = candidate.resolution?.workContextId ?? null; const context = contextId ? contextById.get(contextId) : null;
      return { id: candidate.parsedEntityId, title: candidate.draft.title, sourceLabel: candidate.inboxItem.source, estimatedMinutes: candidate.draft.estimatedMinutes ?? null, workContextId: contextId, contextTitle: context?.title ?? candidate.draft.workContextHint ?? null };
    }), contexts: contexts.workContexts
  };
};

export const loadWorkBoard = async (): Promise<WorkBoardViewModel> => {
  try {
    const sql = getWebSql(); const userId = getWebUserId();
    const profiles = await sql<{ timezone: string }[]>`select timezone from public.profiles where id=${userId}`;
    if (!profiles[0]) throw new Error("사용자 profile을 찾지 못했습니다.");
    return readWorkBoard(sql, userId, profiles[0].timezone);
  } catch (error) {
    const today = localDate(new Date(), "Asia/Seoul");
    return { configured: false, error: error instanceof Error ? error.message : "Work & Calendar를 불러오지 못했습니다.", timeZone: "Asia/Seoul", today,
      monthLabel: "", weeklyWins: [], monthlyWins: [], week: [], todayTasks: [], todayQuests: [], todayEvents: [], todayCapacityMinutes: null,
      todayWorkloadMinutes: 0, deadlineWarning: null, month: [], unplannedTasks: [], candidates: [], contexts: [] };
  }
};

export const createWebTaskService = (sql: Sql) => new TaskService(new SupabaseTaskRepository(sql), new SystemClock());
export const createWebTaskRepository = (sql: Sql) => new SupabaseTaskRepository(sql);
export const createWebInputService = (sql: Sql) => new InputService(new SupabaseInputRepository(sql), new DeterministicTestInterpreter(), createWebTaskService(sql));
