import "server-only";

import { deriveCurrentAction, DynamicReplanningService, SupabaseMorningRepository, SupabaseReplanRepository } from "@amber/core";
import { SystemClock, type UserId } from "@amber/shared";
import postgres, { type Sql } from "postgres";
import type { HomeProposalChange, HomeTimelineItem, HomeViewModel } from "./home-types";

const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare global { var amberWebSql: Sql | undefined; }

export const getWebSql = (): Sql => {
  if (!globalThis.amberWebSql) globalThis.amberWebSql = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, { max: 5 });
  return globalThis.amberWebSql;
};

export const getWebUserId = (): UserId => {
  const value = process.env.AMBER_USER_ID?.trim();
  if (!value || !UUID.test(value)) throw new Error("AMBER_USER_ID에 사용할 profile UUID를 설정해 주세요.");
  return value as UserId;
};

const localDate = (value: Date, timeZone: string): string => {
  const fields = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const read = (type: string) => fields.find((item) => item.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

const time = (value: Date, timeZone: string): string => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(value);

type PlanRow = { id: string; revision_no: number; input_snapshot: unknown };
type ItemRow = {
  id: string; item_type: "task" | "routine" | "rest" | "buffer"; task_id: string | null;
  activity_occurrence_id: string | null; title: string; planned_start_at: Date; planned_end_at: Date;
  planned_minutes: number; status: string; context_title: string | null;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

const readItems = async (sql: Sql, userId: UserId, planId: string): Promise<ItemRow[]> => sql<ItemRow[]>`
  select i.id,i.item_type,i.task_id,i.activity_occurrence_id,
    coalesce(t.title,a.title,case when i.item_type='buffer' then '버퍼' else '휴식' end) title,
    i.planned_start_at,i.planned_end_at,i.planned_minutes,i.status,
    coalesce(w.title,g.title) context_title
  from public.plan_items i
  left join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
  left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
  left join public.work_contexts w on w.id=coalesce(t.work_context_id,o.work_context_id) and w.user_id=t.user_id
  left join public.goals g on g.id=o.goal_id and g.user_id=o.user_id
  left join public.activity_occurrences ao on ao.id=i.activity_occurrence_id and ao.user_id=i.user_id
  left join public.recurring_activities a on a.id=ao.recurring_activity_id and a.user_id=ao.user_id
  where i.user_id=${userId} and i.daily_plan_id=${planId}
    and i.planned_start_at is not null and i.planned_end_at is not null
  order by i.position
`;

const itemKey = (item: ItemRow): string => item.task_id ?? item.activity_occurrence_id ?? `${item.item_type}:${item.title}`;

const proposalChanges = (before: readonly ItemRow[], after: readonly ItemRow[], timeZone: string): HomeProposalChange[] => {
  const remaining = new Map(after.map((item) => [itemKey(item), item]));
  const changes = before.map((item) => {
    const key = itemKey(item);
    const next = remaining.get(key);
    remaining.delete(key);
    if (!next) return { key, title: item.title, change: "deferred" as const, before: time(item.planned_start_at, timeZone), after: null };
    const moved = item.planned_start_at.getTime() !== next.planned_start_at.getTime();
    return {
      key, title: item.title, change: moved ? "moved" as const : "kept" as const,
      before: time(item.planned_start_at, timeZone), after: time(next.planned_start_at, timeZone)
    };
  });
  for (const [key, item] of remaining) changes.push({
    key, title: item.title, change: "added", before: null, after: time(item.planned_start_at, timeZone)
  });
  return changes;
};

const reasonLabels: Record<string, string> = {
  user_unavailable: "요청한 휴식 시간을 먼저 보호하고 남은 일을 다시 배치했습니다.",
  user_defer_current: "현재 작업을 제외하고 다음 실행 가능한 일을 다시 배치했습니다.",
  user_prioritize_task: "지정한 작업을 오늘 계획에서 우선 배치했습니다.",
  user_reduce_today: "우선순위가 가장 낮은 작업을 오늘 계획에서 제외했습니다.",
  user_exclude_after: "요청한 시간 이후에는 집중 작업을 배치하지 않았습니다.",
  user_rebalance: "현재 Task와 고정 일정을 기준으로 남은 순서를 다시 계산했습니다."
};

export const createWebReplanService = (sql: Sql) => new DynamicReplanningService({
  repository: new SupabaseReplanRepository(sql),
  observationReader: new SupabaseMorningRepository(sql),
  clock: new SystemClock()
});

export const loadHomeViewModel = async (): Promise<HomeViewModel> => {
  const now = new Date();
  try {
    const sql = getWebSql();
    const userId = getWebUserId();
    const profiles = await sql<{ timezone: string }[]>`select timezone from public.profiles where id=${userId}`;
    if (!profiles[0]) throw new Error("AMBER_USER_ID에 해당하는 profile을 찾지 못했습니다.");
    const timeZone = profiles[0].timezone;
    const date = localDate(now, timeZone);
    const [plans, currentAction, goals, agents, decisionRows, pendingRuns] = await Promise.all([
      sql<PlanRow[]>`select id,revision_no,input_snapshot from public.daily_plans where user_id=${userId} and plan_date=${date} and status='approved' order by revision_no desc limit 1`,
      deriveCurrentAction(sql, userId, date),
      sql<{ name: string; status: string }[]>`select title name,status from public.goals where user_id=${userId} and status='active' order by importance desc,created_at limit 3`,
      sql<{ name: string; run_status: string | null }[]>`
        select i.name,r.status run_status from public.agent_instances i
        left join lateral(select status from public.agent_runs where user_id=i.user_id and agent_instance_id=i.id order by started_at desc limit 1) r on true
        where i.user_id=${userId} and i.status='active' order by i.created_at limit 4
      `,
      sql<{ count: number }[]>`select count(*)::int count from public.approval_requests where user_id=${userId} and status='pending'`,
      sql<{ plan_id: string; trigger_id: string; impact_reasons: string[] }[]>`
        select checkpoint_state->>'planId' plan_id,checkpoint_state->>'triggerId' trigger_id,
          coalesce(array(select jsonb_array_elements_text(checkpoint_state->'impactReasons')),'{}') impact_reasons
        from public.workflow_runs where user_id=${userId} and workflow_type='dynamic_replanning'
          and status='waiting_for_user' and current_step='awaiting_approval' and checkpoint_state->>'planDate'=${date}
        order by updated_at desc limit 1
      `
    ]);
    const approved = plans[0] ?? null;
    const approvedItems = approved ? await readItems(sql, userId, approved.id) : [];
    const fixedEvents = approved ? (Array.isArray(record(approved.input_snapshot).fixedEvents)
      ? record(approved.input_snapshot).fixedEvents as Record<string, unknown>[] : []) : [];
    const currentItem = currentAction?.planItemId ? approvedItems.find((item) => item.id === currentAction.planItemId) : null;
    const timeline: HomeTimelineItem[] = [
      ...approvedItems.map((item) => ({
        id: item.id, kind: item.item_type, title: item.title,
        startsAt: item.planned_start_at.toISOString(), endsAt: item.planned_end_at.toISOString(),
        minutes: item.planned_minutes, status: item.status, context: item.context_title,
        current: currentAction?.planItemId === item.id
      })),
      ...fixedEvents.flatMap((item) => {
        const start = new Date(String(item.start));
        const end = new Date(String(item.end));
        return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? [] : [{
          id: String(item.id), kind: "calendar" as const, title: typeof item.title === "string" ? item.title : "고정 일정",
          startsAt: start.toISOString(), endsAt: end.toISOString(), minutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)),
          status: "fixed", context: "Calendar", current: false
        }];
      })
    ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    let proposal: HomeViewModel["proposal"] = null;
    const pending = pendingRuns[0];
    if (pending) {
      const [proposalPlans, proposedItems, triggers] = await Promise.all([
        sql<{ revision_no: number; input_snapshot: unknown }[]>`select revision_no,input_snapshot from public.daily_plans where id=${pending.plan_id} and user_id=${userId} and status='pending_approval'`,
        readItems(sql, userId, pending.plan_id),
        sql<{ payload: unknown }[]>`select payload from public.domain_events where id=${pending.trigger_id} and user_id=${userId}`
      ]);
      if (proposalPlans[0]) {
        const adjustment = record(record(triggers[0]?.payload).adjustment);
        const primaryReason = pending.impact_reasons.map((reason) => reasonLabels[reason]).find(Boolean);
        proposal = {
          planId: pending.plan_id,
          revisionNo: proposalPlans[0].revision_no,
          summary: typeof adjustment.summary === "string" ? adjustment.summary : "오늘 일정 재조정",
          reason: primaryReason ?? "마감, 중요도와 남은 가용시간을 기준으로 다시 계산했습니다.",
          changes: proposalChanges(approvedItems, proposedItems, timeZone)
        };
      }
    }
    return {
      configured: true, error: null, date, timeZone,
      currentAction: currentAction ? {
        title: currentAction.title, minutes: currentItem?.planned_minutes ?? null,
        context: currentItem?.context_title ?? null, source: currentAction.source
      } : null,
      approvedPlan: approved ? { id: approved.id, revisionNo: approved.revision_no } : null,
      timeline,
      goals,
      agents: agents.map((item) => ({
        name: item.name, status: item.run_status === "running" ? "working" : "idle",
        detail: item.run_status === "running" ? "작업 중" : "대기 중"
      })),
      decisionCount: decisionRows[0]?.count ?? 0,
      proposal
    };
  } catch (error) {
    return {
      configured: false, error: error instanceof Error ? error.message : "Home 데이터를 불러오지 못했습니다.",
      date: localDate(now, "Asia/Seoul"), timeZone: "Asia/Seoul", currentAction: null, approvedPlan: null,
      timeline: [], goals: [], agents: [], decisionCount: 0, proposal: null
    };
  }
};
