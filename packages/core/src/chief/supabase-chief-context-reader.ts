import { zonedDateTimeToUtc, type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { SupabaseAgentRunRecorder } from "../agent-execution/supabase-agent-run-recorder.js";
import { deriveCurrentAction } from "../execution/current-action.js";
import type { MorningRepository } from "../morning/morning.js";
import type { ChiefContext, ChiefContextReader, ChiefRunRecord, ChiefRunRecorder } from "./chief.js";

const addDays = (date: string, count: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};

export class SupabaseChiefContextReader implements ChiefContextReader {
  constructor(private readonly sql: Sql, private readonly observationReader: Pick<MorningRepository, "loadObservation">) {}

  async loadChiefContext(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<ChiefContext> {
    const start = zonedDateTimeToUtc(`${planDate}T00:00:00`, timeZone);
    const end = zonedDateTimeToUtc(`${addDays(planDate, 1)}T00:00:00`, timeZone);
    const [observation, plans, action, focus, replans, settings] = await Promise.all([
      this.observationReader.loadObservation(userId, planDate, timeZone, now),
      this.sql<{ id: string; revision_no: number }[]>`
        select id,revision_no from public.daily_plans
        where user_id=${userId} and plan_date=${planDate} and status='approved'
        order by revision_no desc limit 1
      `,
      deriveCurrentAction(this.sql, userId, planDate),
      this.sql<{ id: string; task_id: string; title: string; started_at: Date }[]>`
        select f.id,f.task_id,t.title,f.started_at from public.focus_sessions f
        join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
        where f.user_id=${userId} and f.status='active' order by f.started_at desc limit 1
      `,
      this.sql<{ present: boolean }[]>`
        select exists(select 1 from public.domain_events where user_id=${userId} and event_type='plan_replanned'
          and occurred_at>=${start} and occurred_at<${end}) present
      `,
      this.sql<{ week_starts_on: number }[]>`select week_starts_on from public.user_settings where user_id=${userId}`
    ]);
    return {
      userId,
      observedAt: now,
      planDate,
      timeZone,
      observation,
      approvedPlan: plans[0] ? { id: plans[0].id, revisionNo: plans[0].revision_no } : null,
      currentAction: action,
      activeFocus: focus[0] ? { id: focus[0].id, taskId: focus[0].task_id, title: focus[0].title, startedAt: focus[0].started_at } : null,
      replannedToday: replans[0]?.present ?? false,
      weekStartsOn: settings[0]?.week_starts_on ?? 1
    };
  }
}

export class SupabaseChiefRunRecorder implements ChiefRunRecorder {
  private readonly recorder: SupabaseAgentRunRecorder;

  constructor(sql: Sql) {
    this.recorder = new SupabaseAgentRunRecorder(sql);
  }

  async findCompleted(userId: UserId, triggerId: string): Promise<ChiefRunRecord | null> {
    const reply = await this.recorder.findCompleted(userId, "chief", "chief_response", triggerId);
    return reply ? { reply } : null;
  }

  async recordCompleted(input: Parameters<ChiefRunRecorder["recordCompleted"]>[0]): Promise<void> {
    const contextPayload = {
      planDate: input.context.planDate,
      approvedPlanId: input.context.approvedPlan?.id ?? null,
      currentAction: input.context.currentAction,
      activeFocusId: input.context.activeFocus?.id ?? null,
      fixedConstraintIds: input.context.observation.constraints.filter((item) => item.blocksCapacity).map((item) => item.id),
      taskIds: input.context.observation.tasks.map((task) => task.id),
      blockedTaskIds: input.context.observation.tasks.filter((task) => task.status === "BLOCKED").map((task) => task.id),
      recurringActivityIds: input.context.observation.recurringActivities.map((activity) => activity.id),
      carryoverTaskIds: input.context.observation.carryoverContext?.taskIds ?? [],
      availablePrincipleIds: input.context.observation.principles?.map((principle) => principle.id) ?? [],
      usedPrincipleIds: input.usedPrincipleIds,
      replannedToday: input.context.replannedToday
    };
    await this.recorder.recordCompleted({
      userId: input.context.userId,
      agentTemplateKey: "chief",
      artifactType: "chief_response",
      triggerId: input.triggerId,
      source: input.source,
      requestKind: input.requestKind,
      contextPayload,
      reply: input.reply,
      policyVersion: "chief-v0.1",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      workstyleProfileRevisions: input.workstyle?.profileRevisions ?? []
    });
  }

  async recordDelegationCompleted(input: Parameters<NonNullable<ChiefRunRecorder["recordDelegationCompleted"]>>[0]): Promise<void> {
    await this.recorder.recordCompleted({
      userId: input.userId,
      agentTemplateKey: "chief",
      artifactType: "chief_response",
      triggerId: input.triggerId,
      source: input.source,
      requestKind: "project_delegation",
      contextPayload: {
        delegatedAgent: "project_pm",
        projectId: input.report.project.id,
        status: input.report.status,
        nextTaskId: input.report.nextAction?.taskId ?? null,
        blockerCount: input.report.blockers.length,
        nearestDeadlineTaskId: input.report.nearestDeadline?.taskId ?? null
      },
      reply: input.reply,
      policyVersion: "chief-v0.1",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      workstyleProfileRevisions: input.workstyle?.profileRevisions ?? [],
      correlationId: input.correlationId
    });
  }
}
