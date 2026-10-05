import { zonedDateTimeToUtc, type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import {
  SupabaseContextManagementRepository
} from "../context-management/supabase-context-management-repository.js";
import type {
  CertificationContextRecord,
  CourseContextRecord,
  ProjectContextRecord
} from "../context-management/context-management.js";
import type { MorningConstraint, MorningObservation } from "../morning/morning.js";
import { SupabaseMorningRepository } from "../morning/supabase-morning-repository.js";
import { calculateDailyCapacity } from "../rules/daily-capacity-policy.js";
import { getRemainingMinutes } from "../rules/duration.js";
import { isTerminalTaskStatus, type Task } from "../task/task.js";
import type {
  WorldDailyCapacity,
  WorldExecutionItem,
  WorldFocusItem,
  WorldLearningContext,
  WorldModelSnapshot,
  WorldProjectContext,
  WorldRisk,
  WorldTask
} from "./world-model.js";

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const localDate = (value: Date, timeZone: string): string => new Intl.DateTimeFormat("en-CA", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit"
}).format(value);

export interface WorldExecutionOutcome {
  readonly outcome: "completed" | "partial" | "skipped";
  readonly taskId: string;
  readonly title: string;
  readonly occurredAt: Date;
  readonly actualMinutes: number;
}

export interface WorldModelSourceState {
  readonly observation: MorningObservation;
  readonly calendarEvents: readonly MorningConstraint[];
  readonly projects: readonly ProjectContextRecord[];
  readonly courses: readonly CourseContextRecord[];
  readonly certifications: readonly CertificationContextRecord[];
  readonly execution: readonly WorldExecutionOutcome[];
  readonly weekFocus: readonly WorldFocusItem[];
  readonly futureConstraints: readonly MorningConstraint[];
}

export interface WorldModelSource {
  read(userId: UserId, date: string, timeZone: string): Promise<WorldModelSourceState>;
}

export class SupabaseWorldModelSource implements WorldModelSource {
  private readonly morning: SupabaseMorningRepository;
  private readonly contexts: SupabaseContextManagementRepository;

  constructor(private readonly sql: Sql) {
    this.morning = new SupabaseMorningRepository(sql);
    this.contexts = new SupabaseContextManagementRepository(sql);
  }

  async read(userId: UserId, date: string, timeZone: string): Promise<WorldModelSourceState> {
    const dayStart = zonedDateTimeToUtc(`${date}T00:00:00`, timeZone);
    const dayEnd = zonedDateTimeToUtc(`${addDays(date, 1)}T00:00:00`, timeZone);
    const futureStart = dayEnd;
    const futureEnd = zonedDateTimeToUtc(`${addDays(date, 8)}T00:00:00`, timeZone);
    const [observation, projects, courses, certifications, outcomeRows, focusRows, calendarRows, constraintRows] = await Promise.all([
      this.morning.loadObservation(userId, date, timeZone),
      this.contexts.listProjects(userId),
      this.contexts.listCourses(userId),
      this.contexts.listCertifications(userId),
      this.sql<{
        event_type: "task_completed" | "task_closed_partial" | "task_skipped";
        aggregate_id: string; occurred_at: Date; title: string; actual_minutes: number;
      }[]>`
        select e.event_type,e.aggregate_id,e.occurred_at,t.title,t.actual_minutes
        from public.domain_events e join public.tasks t on t.id=e.aggregate_id and t.user_id=e.user_id
        where e.user_id=${userId} and e.aggregate_type='task'
          and e.event_type in ('task_completed','task_closed_partial','task_skipped')
          and e.occurred_at>=${dayStart} and e.occurred_at<${dayEnd}
        order by e.occurred_at,e.id
      `,
      this.sql<{ id: string; title: string }[]>`
        select id,title from public.goals
        where user_id=${userId} and status='active' and level='WEEKLY'
          and (period_start is null or period_start<=${date})
          and (period_end is null or period_end>=${date})
        order by created_at,id
      `,
      this.sql<{
        id: string; constraint_type: string; value: unknown; hardness: string;
        valid_from: Date; valid_until: Date | null; origin: string;
      }[]>`
        select c.id,c.constraint_type,c.value,c.hardness,c.valid_from,c.valid_until,c.origin
        from public.constraints c
        join public.external_references r on r.internal_entity_id=c.id and r.user_id=c.user_id
        where c.user_id=${userId} and c.valid_from<${dayEnd} and c.valid_until>${dayStart}
          and r.external_type='calendar_event' and r.ownership='external' and r.sync_status='active'
          and coalesce(c.value->>'syncStatus','active')='active'
        order by c.valid_from,c.id
      `,
      this.sql<{
        id: string; constraint_type: string; value: unknown; hardness: string;
        valid_from: Date; valid_until: Date | null; origin: string;
      }[]>`
        select id,constraint_type,value,hardness,valid_from,valid_until,origin
        from public.constraints
        where user_id=${userId} and valid_from<${futureEnd}
          and (valid_until is null or valid_until>${futureStart})
        order by valid_from,id
      `
    ]);
    return {
      observation,
      calendarEvents: calendarRows.map((row) => this.mapConstraint(row, dayEnd)),
      projects,
      courses,
      certifications,
      execution: outcomeRows.map((row) => ({
        outcome: row.event_type === "task_completed" ? "completed" : row.event_type === "task_closed_partial" ? "partial" : "skipped",
        taskId: row.aggregate_id,
        title: row.title,
        occurredAt: row.occurred_at,
        actualMinutes: row.actual_minutes
      })),
      weekFocus: focusRows.map((row) => ({ id: row.id, title: row.title, type: "weekly_goal" })),
      futureConstraints: constraintRows.map((row) => this.mapConstraint(row, futureEnd))
    };
  }

  private mapConstraint(row: {
    id: string; constraint_type: string; value: unknown; hardness: string;
    valid_from: Date; valid_until: Date | null; origin: string;
  }, fallbackEnd: Date): MorningConstraint {
    const value = row.value && typeof row.value === "object" && !Array.isArray(row.value)
      ? row.value as Record<string, unknown> : {};
    return {
      id: row.id,
      constraintType: row.constraint_type,
      hardness: row.hardness,
      origin: row.origin,
      title: typeof value.title === "string" ? value.title : null,
      blocksCapacity: value.blocksCapacity === true,
      start: row.valid_from,
      end: row.valid_until ?? fallbackEnd
    };
  }
}

const deadlineFor = (task: Task): Pick<WorldTask, "deadline" | "deadlineSource"> => {
  if (task.internalDeadline && (!task.officialDeadline || task.internalDeadline <= task.officialDeadline)) {
    return { deadline: task.internalDeadline, deadlineSource: "internal" };
  }
  return task.officialDeadline
    ? { deadline: task.officialDeadline, deadlineSource: "official" }
    : { deadline: null, deadlineSource: null };
};

const executionItem = (outcome: WorldExecutionOutcome): WorldExecutionItem => ({
  taskId: outcome.taskId,
  title: outcome.title,
  occurredAt: outcome.occurredAt,
  actualMinutes: outcome.actualMinutes
});

const summarizeWork = (tasks: readonly WorldTask[]) => ({
  activeTaskIds: tasks.map((task) => task.id),
  remainingWorkloadMinutes: tasks.reduce((sum, task) => sum + (task.remainingMinutes ?? 0), 0),
  unknownEffortTaskIds: tasks.filter((task) => task.remainingMinutes === null).map((task) => task.id)
});

export class WorldModelBuilder {
  constructor(private readonly source: WorldModelSource) {}

  async build(userId: UserId, timeZone: string, now = new Date()): Promise<WorldModelSnapshot> {
    const date = localDate(now, timeZone);
    const state = await this.source.read(userId, date, timeZone);
    const contextById = new Map<string, { type: WorldTask["contextType"]; title: string }>([
      ...state.projects.map((context) => [context.id, { type: "project" as const, title: context.title }] as const),
      ...state.courses.map((context) => [context.id, { type: "course" as const, title: context.title }] as const),
      ...state.certifications.map((context) => [context.id, { type: "certification" as const, title: context.title }] as const)
    ]);
    const tasks: WorldTask[] = state.observation.tasks.flatMap((task) => {
      if (isTerminalTaskStatus(task.status)) return [];
      const context = task.workContextId ? contextById.get(task.workContextId) : undefined;
      const estimatedMinutes = task.estimatedUserMinutes ?? task.estimatedMinutes;
      return [{
        id: task.id,
        title: task.title,
        contextId: task.workContextId,
        contextType: context?.type ?? null,
        contextTitle: context?.title ?? null,
        taskType: context?.type === "project" ? "project" : context?.type === "course" || context?.type === "certification" ? "learning" : "user",
        status: task.status,
        importance: task.importance,
        ...deadlineFor(task),
        estimatedMinutes,
        actualMinutes: task.actualMinutes,
        remainingMinutes: getRemainingMinutes(estimatedMinutes, task.actualMinutes),
        plannedDate: task.plannedDate ?? null,
        completionCriteria: task.completionCriteria
      }];
    });
    const tasksByContext = (contextId: string) => tasks.filter((task) => task.contextId === contextId);
    const projects: WorldProjectContext[] = state.projects.map((context) => {
      const contextTasks = tasksByContext(context.id);
      return {
        id: context.id,
        title: context.title,
        commitmentLevel: context.commitmentLevel,
        strategicImportance: context.strategicImportance,
        ...summarizeWork(contextTasks),
        deadlines: contextTasks.flatMap((task) => task.deadline ? [task.deadline] : []).sort((left, right) => left.getTime() - right.getTime())
      };
    });
    const learning: WorldLearningContext[] = [
      ...state.courses.map((context): WorldLearningContext => ({
        id: context.id,
        type: "course",
        title: context.title,
        commitmentLevel: context.commitmentLevel,
        strategicImportance: context.strategicImportance,
        target: context.targetGrade,
        targetDate: context.endDate,
        ...summarizeWork(tasksByContext(context.id))
      })),
      ...state.certifications.map((context): WorldLearningContext => ({
        id: context.id,
        type: "certification",
        title: context.title,
        commitmentLevel: context.commitmentLevel,
        strategicImportance: context.strategicImportance,
        target: context.targetOutcome,
        targetDate: context.examDate,
        ...summarizeWork(tasksByContext(context.id))
      }))
    ];
    const todayCapacity = calculateDailyCapacity({
      planDate: date,
      timeZone,
      now,
      blockingIntervals: state.observation.constraints.filter((constraint) => constraint.blocksCapacity),
      planningBufferMinutes: state.observation.planningBufferMinutes
    });
    const futureCapacity: WorldDailyCapacity[] = Array.from({ length: 7 }, (_, index) => addDays(date, index + 1)).map((futureDate) => {
      const result = calculateDailyCapacity({
        planDate: futureDate,
        timeZone,
        now,
        blockingIntervals: state.futureConstraints.filter((constraint) => constraint.blocksCapacity),
        planningBufferMinutes: state.observation.planningBufferMinutes
      });
      return {
        date: futureDate,
        availableMinutes: result.availableMinutes,
        blockedMinutes: result.blockedMinutes,
        elapsedMinutes: result.elapsedMinutes,
        planningBufferMinutes: result.planningBufferMinutes
      };
    });
    const overdueTaskIds = tasks.filter((task) => task.deadline && task.deadline < now).map((task) => task.id);
    const todayTasks = tasks.filter((task) => task.plannedDate === date);
    const knownTodayWorkload = todayTasks.reduce((sum, task) => sum + (task.remainingMinutes ?? 0), 0);
    const risks: WorldRisk[] = [
      ...(overdueTaskIds.length ? [{ type: "deadline_overdue" as const, taskIds: overdueTaskIds }] : []),
      ...(todayTasks.every((task) => task.remainingMinutes !== null) && knownTodayWorkload > todayCapacity.availableMinutes
        ? [{
            type: "today_workload_exceeds_capacity" as const,
            taskIds: todayTasks.map((task) => task.id),
            workloadMinutes: knownTodayWorkload,
            availableMinutes: todayCapacity.availableMinutes
          }]
        : [])
    ];
    return {
      now,
      timeZone,
      contexts: { learning, projects },
      tasks,
      execution: {
        completedToday: state.execution.filter((item) => item.outcome === "completed").map(executionItem),
        partialToday: state.execution.filter((item) => item.outcome === "partial").map(executionItem),
        skippedToday: state.execution.filter((item) => item.outcome === "skipped").map(executionItem)
      },
      constraints: {
        calendarEvents: state.calendarEvents.map((constraint) => ({
          id: constraint.id,
          title: constraint.title,
          startsAt: constraint.start,
          endsAt: constraint.end,
          origin: constraint.origin
        })),
        todayCapacity: {
          availableMinutes: todayCapacity.availableMinutes,
          blockedMinutes: todayCapacity.blockedMinutes,
          elapsedMinutes: todayCapacity.elapsedMinutes,
          planningBufferMinutes: todayCapacity.planningBufferMinutes
        },
        futureCapacity
      },
      risks,
      focus: { week: state.weekFocus, todayMustWin: null }
    };
  }
}

export const buildWorldModelSnapshot = (
  sql: Sql,
  userId: UserId,
  timeZone: string,
  now = new Date()
): Promise<WorldModelSnapshot> => new WorldModelBuilder(new SupabaseWorldModelSource(sql)).build(userId, timeZone, now);
