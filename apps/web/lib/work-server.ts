import "server-only";

import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { DeterministicTestInterpreter, InputService, SupabaseInputRepository } from "@amber/input";
import { SystemClock, type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { getWebSql, getWebUserId } from "./web-runtime";
import type { WorkBoardViewModel, WorkTaskItem } from "./work-types";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  official_deadline: Date | null;
  internal_deadline: Date | null;
  estimated_minutes: number | null;
  work_context_id: string | null;
  context_title: string | null;
  source: string | null;
  reference_source: string | null;
};

const sourceLabel = (source: string): string => {
  if (source === "notion") return "Notion";
  if (source === "discord") return "Discord";
  if (source === "backlog_approval") return "Project AI";
  if (source === "snowboard") return "Snowboard";
  if (source === "manual" || source === "work_board") return "직접 추가";
  return source || "Amber HQ";
};

const localParts = (date: Date, timeZone: string): Record<string, string> => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
);

const localDate = (date: Date, timeZone: string): string => {
  const part = localParts(date, timeZone);
  return `${part.year}-${part.month}-${part.day}`;
};

const inputDateTime = (date: Date | null, timeZone: string): string => {
  if (!date) return "";
  const part = localParts(date, timeZone);
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
};

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const readTasks = async (sql: Sql, userId: UserId): Promise<TaskRow[]> => sql<TaskRow[]>`
  select t.id,t.title,t.status,t.official_deadline,t.internal_deadline,t.estimated_minutes,
    coalesce(t.work_context_id,o.work_context_id) work_context_id,
    w.title context_title,
    coalesce(reference.source,created.payload->>'source',created.actor_type,'manual') source,
    reference.source reference_source
  from public.tasks t
  left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
  left join public.work_contexts w on w.id=coalesce(t.work_context_id,o.work_context_id) and w.user_id=t.user_id
  left join lateral (
    select r.source from public.external_references r
    where r.user_id=t.user_id and r.internal_entity_type='task' and r.internal_entity_id=t.id
      and r.ownership='external' and r.sync_status='active'
    order by r.last_seen_at desc limit 1
  ) reference on true
  left join lateral (
    select e.actor_type,e.payload from public.domain_events e
    where e.user_id=t.user_id and e.aggregate_type='task' and e.aggregate_id=t.id and e.event_type='task_created'
    order by e.occurred_at asc limit 1
  ) created on true
  where t.user_id=${userId} and t.status<>'DONE'
  order by coalesce(t.internal_deadline,t.official_deadline) nulls last,t.created_at
`;

export const readWorkBoard = async (
  sql: Sql,
  userId: UserId,
  timeZone: string,
  now = new Date()
): Promise<WorkBoardViewModel> => {
  const inputRepository = new SupabaseInputRepository(sql);
  const [pending, taskRows, contexts] = await Promise.all([
    inputRepository.listPendingTaskConfirmations(userId),
    readTasks(sql, userId),
    inputRepository.getContextCandidates(userId)
  ]);
  const contextById = new Map(contexts.workContexts.map((context) => [context.id, context]));
  const today = localDate(now, timeZone);
  const weekEnd = addDays(today, 7);
  const tasks: WorkTaskItem[] = taskRows.map((row) => {
    const source = row.source ?? "manual";
    const planningDeadline = row.internal_deadline ?? row.official_deadline;
    return {
      id: row.id, title: row.title, status: row.status,
      planningDeadlineValue: inputDateTime(planningDeadline, timeZone),
      officialDeadlineLabel: row.official_deadline ? new Intl.DateTimeFormat("ko-KR", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(row.official_deadline) : null,
      officialDeadlineSourceLabel: row.reference_source ? sourceLabel(row.reference_source) : null,
      targetDeadlineValue: inputDateTime(row.internal_deadline, timeZone),
      targetDeadlineLabel: row.internal_deadline ? new Intl.DateTimeFormat("ko-KR", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(row.internal_deadline) : null,
      deadlineWarning: row.official_deadline !== null && row.internal_deadline !== null && row.internal_deadline > row.official_deadline,
      estimatedMinutes: row.estimated_minutes, workContextId: row.work_context_id,
      contextTitle: row.context_title, source, sourceLabel: sourceLabel(source)
    };
  });
  const group = (key: "today" | "week" | "later") => tasks.filter((task) => {
    const date = task.planningDeadlineValue.slice(0, 10);
    if (key === "today") return Boolean(date) && date <= today;
    if (key === "week") return Boolean(date) && date > today && date <= weekEnd;
    return !date || date > weekEnd;
  });
  return {
    configured: true, error: null, timeZone,
    candidates: pending.map((candidate) => {
      const deadline = candidate.draft.officialDeadline ? new Date(candidate.draft.officialDeadline) : null;
      const source = candidate.inboxItem.source;
      const candidateContextId = candidate.resolution?.workContextId ?? null;
      const context = candidateContextId ? contextById.get(candidateContextId) : null;
      return {
        id: candidate.parsedEntityId, title: candidate.draft.title, source, sourceLabel: sourceLabel(source),
        deadlineValue: inputDateTime(deadline, timeZone),
        deadlineLabel: deadline ? new Intl.DateTimeFormat("ko-KR", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(deadline) : null,
        estimatedMinutes: candidate.draft.estimatedMinutes ?? null,
        workContextId: candidateContextId,
        contextTitle: context?.title ?? candidate.draft.workContextHint ?? null
      };
    }),
    groups: [
      { key: "today", label: "오늘", tasks: group("today") },
      { key: "week", label: "이번 주", tasks: group("week") },
      { key: "later", label: "이후", tasks: group("later") }
    ],
    contexts: contexts.workContexts
  };
};

export const loadWorkBoard = async (): Promise<WorkBoardViewModel> => {
  try {
    const sql = getWebSql();
    const userId = getWebUserId();
    const profiles = await sql<{ timezone: string }[]>`select timezone from public.profiles where id=${userId}`;
    if (!profiles[0]) throw new Error("사용자 profile을 찾지 못했습니다.");
    return readWorkBoard(sql, userId, profiles[0].timezone);
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : "Work Board를 불러오지 못했습니다.",
      timeZone: "Asia/Seoul", candidates: [],
      groups: [
        { key: "today", label: "오늘", tasks: [] },
        { key: "week", label: "이번 주", tasks: [] },
        { key: "later", label: "이후", tasks: [] }
      ],
      contexts: []
    };
  }
};

export const createWebTaskService = (sql: Sql) => new TaskService(new SupabaseTaskRepository(sql), new SystemClock());

export const createWebTaskRepository = (sql: Sql) => new SupabaseTaskRepository(sql);

export const createWebInputService = (sql: Sql) => new InputService(
  new SupabaseInputRepository(sql), new DeterministicTestInterpreter(), createWebTaskService(sql)
);
