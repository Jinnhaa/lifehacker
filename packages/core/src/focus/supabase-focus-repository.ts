import type { UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import { assertTaskTransition } from "../task/task-state-machine.js";
import { deriveCurrentAction, type DerivedCurrentAction } from "../execution/current-action.js";
import type {
  BlockCategory,
  CompleteFocusResult,
  FocusCheckpoint,
  FocusContext,
  FocusRepository,
  FocusTaskStep,
  FocusWorkflowRun,
  FocusWorkflowStep,
  RecoveryResult,
  SwitchResult
} from "./focus.js";

interface WorkflowRow {
  id: string; user_id: string; status: string; current_step: string;
  checkpoint_state: unknown; checkpoint_version: number; correlation_id: string;
}

interface SessionRow {
  id: string; user_id: string; task_id: string; plan_item_id: string | null;
  current_step_id: string | null; status: string; started_at: Date; actual_minutes: number;
}

interface TaskRow {
  id: string; title: string; status: string; completion_criteria: string | null;
  estimated_minutes: number | null; estimated_user_minutes: number | null; actual_minutes: number; next_action: string | null;
}

interface StepRow {
  id: string; position: number; title: string; owner: "user" | "ai"; estimated_minutes: number | null;
  completion_criteria: string | null; status: string;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

const mapCheckpoint = (value: unknown): FocusCheckpoint => {
  const record = asRecord(value);
  return {
    sessionId: String(record.sessionId ?? ""),
    taskId: String(record.taskId ?? ""),
    planItemId: typeof record.planItemId === "string" ? record.planItemId : null,
    ...(typeof record.blockCategory === "string" ? { blockCategory: record.blockCategory as BlockCategory } : {}),
    ...(typeof record.blockDetail === "string" ? { blockDetail: record.blockDetail } : {}),
    ...(typeof record.pendingStepSplit === "boolean" ? { pendingStepSplit: record.pendingStepSplit } : {}),
    ...(typeof record.lastMessageId === "string" ? { lastMessageId: record.lastMessageId } : {}),
    ...(typeof record.lastReply === "string" ? { lastReply: record.lastReply } : {})
  };
};

const mapWorkflow = (row: WorkflowRow): FocusWorkflowRun => ({
  id: row.id,
  userId: row.user_id as UserId,
  status: row.status as FocusWorkflowRun["status"],
  currentStep: row.current_step as FocusWorkflowStep,
  checkpoint: mapCheckpoint(row.checkpoint_state),
  checkpointVersion: row.checkpoint_version,
  correlationId: row.correlation_id
});

const mapStep = (row: StepRow): FocusTaskStep => ({
  id: row.id,
  position: row.position,
  title: row.title,
  owner: row.owner,
  estimatedMinutes: row.estimated_minutes,
  completionCriteria: row.completion_criteria,
  status: row.status
});

const elapsedMinutes = (startedAt: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));

const event = async (
  sql: Sql,
  input: {
    userId: UserId; eventType: string; aggregateType: string; aggregateId: string; occurredAt: Date;
    correlationId: string; workflowRunId: string; idempotencyKey: string; payload: Record<string, unknown>;
  }
): Promise<void> => {
  await sql`
    insert into public.domain_events(
      user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,
      workflow_run_id,idempotency_key,payload_version,payload
    ) values(
      ${input.userId},${input.eventType},${input.aggregateType},${input.aggregateId},'user',${input.occurredAt},
      ${input.correlationId},${input.workflowRunId},${input.idempotencyKey},1,${sql.json(input.payload as JSONValue)}
    ) on conflict(user_id,idempotency_key) do nothing
  `;
};

export class SupabaseFocusRepository implements FocusRepository {
  constructor(private readonly sql: Sql) {}

  async findCurrentWorkflow(userId: UserId): Promise<FocusWorkflowRun | null> {
    const rows = await this.sql<WorkflowRow[]>`
      select * from public.workflow_runs where user_id=${userId} and workflow_type='focus'
      order by updated_at desc limit 1
    `;
    return rows[0] ? mapWorkflow(rows[0]) : null;
  }

  async start(
    userId: UserId,
    planDate: string,
    now: Date,
    messageId: string
  ): Promise<{ context: FocusContext | null; action: DerivedCurrentAction | null; duplicate: boolean }> {
    return this.sql.begin(async (tx) => {
      const prior = await tx<{ aggregate_id: string }[]>`
        select aggregate_id from public.domain_events where user_id=${userId} and idempotency_key=${`focus-start:${messageId}`}
      `;
      if (prior[0]) {
        const context = await this.getContext(tx, userId, prior[0].aggregate_id);
        const action = context ? {
          kind: "task" as const, source: "focus_session" as const, title: context.taskTitle,
          taskId: context.taskId, planItemId: context.planItemId
        } : null;
        return { context, action, duplicate: true };
      }

      const active = await tx<SessionRow[]>`
        select * from public.focus_sessions where user_id=${userId} and status='active' limit 1 for update
      `;
      if (active[0]) {
        const context = await this.getContext(tx, userId, active[0].id);
        return {
          context,
          action: context ? {
            kind: "task" as const, source: "focus_session" as const, title: context.taskTitle,
            taskId: context.taskId, planItemId: context.planItemId
          } : null,
          duplicate: true
        };
      }

      const action = await deriveCurrentAction(tx, userId, planDate);
      if (!action || action.kind !== "task") return { context: null, action, duplicate: false };
      const tasks = await tx<TaskRow[]>`select id,title,status,completion_criteria,estimated_minutes,estimated_user_minutes,actual_minutes,next_action from public.tasks where id=${action.taskId} and user_id=${userId} for update`;
      const task = tasks[0];
      if (!task) return { context: null, action: null, duplicate: false };
      const steps = await tx<StepRow[]>`
        select id,position,title,owner,estimated_minutes,completion_criteria,status from public.task_steps
        where task_id=${task.id} and user_id=${userId} and status<>'completed' order by position
      `;
      const sessions = await tx<SessionRow[]>`
        insert into public.focus_sessions(user_id,task_id,plan_item_id,current_step_id,status,started_at)
        values(${userId},${task.id},${action.planItemId},${steps[0]?.id ?? null},'active',${now}) returning *
      `;
      const session = sessions[0]!;
      if (session.current_step_id) {
        await tx`update public.task_steps set status='in_progress',updated_at=${now} where id=${session.current_step_id} and user_id=${userId}`;
      }
      const workflows = await tx<WorkflowRow[]>`
        insert into public.workflow_runs(user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at)
        values(${userId},'focus','running','active',${tx.json({
          sessionId: session.id, taskId: task.id, planItemId: action.planItemId, lastMessageId: messageId
        })},0,${`focus:${session.id}`},gen_random_uuid(),${now}) returning *
      `;
      const workflow = mapWorkflow(workflows[0]!);
      if (action.planItemId) {
        await tx`update public.plan_items set status='in_progress',updated_at=${now} where id=${action.planItemId} and user_id=${userId}`;
      }
      if (task.status !== "IN_PROGRESS") {
        assertTaskTransition(task.status as Parameters<typeof assertTaskTransition>[0], "IN_PROGRESS");
        await tx`update public.tasks set status='IN_PROGRESS',updated_at=${now} where id=${task.id} and user_id=${userId}`;
        await event(tx, {
          userId, eventType: task.status === "BLOCKED" || task.status === "WAITING_FOR_USER" ? "task_resumed" : "task_started",
          aggregateType: "task", aggregateId: task.id, occurredAt: now, correlationId: workflow.correlationId,
          workflowRunId: workflow.id, idempotencyKey: `focus-task-start:${messageId}`,
          payload: { previous_status: task.status, next_status: "IN_PROGRESS", source: "discord", changed_at: now.toISOString() }
        });
      }
      await event(tx, {
        userId, eventType: "focus_started", aggregateType: "focus_session", aggregateId: session.id,
        occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
        idempotencyKey: `focus-start:${messageId}`, payload: { task_id: task.id, plan_item_id: action.planItemId }
      });
      return { context: await this.getContext(tx, userId, session.id), action, duplicate: false };
    });
  }

  async complete(userId: UserId, planDate: string, now: Date, messageId: string): Promise<CompleteFocusResult | null> {
    return this.sql.begin(async (tx) => {
      const prior = await tx<{ payload: unknown }[]>`
        select payload from public.domain_events where user_id=${userId} and idempotency_key=${`focus-complete:${messageId}`}
      `;
      if (prior[0]) {
        const payload = asRecord(prior[0].payload);
        if (payload.result === "next_step") {
          const active = await tx<SessionRow[]>`select * from public.focus_sessions where user_id=${userId} and status='active' limit 1`;
          const context = active[0] ? await this.getContext(tx, userId, active[0].id) : null;
          return context ? { kind: "next_step", context } : null;
        }
        const title = String(payload.task_title ?? "Task");
        return { kind: "task_completed", taskTitle: title, nextAction: await deriveCurrentAction(tx, userId, planDate) };
      }
      const sessions = await tx<SessionRow[]>`
        select * from public.focus_sessions where user_id=${userId} and status='active' limit 1 for update
      `;
      const session = sessions[0];
      if (!session) return null;
      const workflows = await tx<WorkflowRow[]>`
        select * from public.workflow_runs where user_id=${userId} and workflow_type='focus'
          and checkpoint_state->>'sessionId'=${session.id} order by updated_at desc limit 1 for update
      `;
      const workflow = workflows[0] ? mapWorkflow(workflows[0]) : null;
      if (!workflow) throw new Error("Focus workflow missing");
      const tasks = await tx<TaskRow[]>`select id,title,status,completion_criteria,estimated_minutes,estimated_user_minutes,actual_minutes,next_action from public.tasks where id=${session.task_id} and user_id=${userId} for update`;
      const task = tasks[0];
      if (!task) throw new Error("Focused task missing");
      if (session.current_step_id) {
        const completed = await tx<StepRow[]>`
          update public.task_steps set status='completed',updated_at=${now}
          where id=${session.current_step_id} and task_id=${task.id} and user_id=${userId} and status<>'completed'
          returning id,position,title,owner,estimated_minutes,completion_criteria,status
        `;
        if (!completed[0]) throw new Error("Current step is stale");
        await event(tx, {
          userId, eventType: "task_step_completed", aggregateType: "task_step", aggregateId: completed[0].id,
          occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
          idempotencyKey: `focus-step-complete:${messageId}`,
          payload: { task_id: task.id, position: completed[0].position }
        });
        const next = await tx<StepRow[]>`
          select id,position,title,owner,estimated_minutes,completion_criteria,status from public.task_steps
          where task_id=${task.id} and user_id=${userId} and status<>'completed' order by position limit 1
        `;
        if (next[0]) {
          await tx`update public.task_steps set status='in_progress',updated_at=${now} where id=${next[0].id} and user_id=${userId}`;
          await tx`update public.focus_sessions set current_step_id=${next[0].id} where id=${session.id} and user_id=${userId}`;
          await this.updateWorkflow(tx, workflow, "active", "running", {
            ...workflow.checkpoint, lastMessageId: messageId
          }, now);
          await event(tx, {
            userId, eventType: "focus_step_advanced", aggregateType: "focus_session", aggregateId: session.id,
            occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
            idempotencyKey: `focus-complete:${messageId}`,
            payload: { result: "next_step", completed_step_id: completed[0].id, next_step_id: next[0].id }
          });
          return { kind: "next_step", context: (await this.getContext(tx, userId, session.id))! };
        }
      }

      assertTaskTransition(task.status as Parameters<typeof assertTaskTransition>[0], "DONE");
      const minutes = elapsedMinutes(session.started_at, now);
      await tx`
        update public.focus_sessions set status='completed',ended_at=${now},end_reason='task_completed',actual_minutes=actual_minutes+${minutes}
        where id=${session.id} and user_id=${userId}
      `;
      await tx`
        update public.tasks set status='DONE',completed_at=${now},actual_minutes=actual_minutes+${minutes},updated_at=${now}
        where id=${task.id} and user_id=${userId}
      `;
      if (session.plan_item_id) await tx`update public.plan_items set status='completed',updated_at=${now} where id=${session.plan_item_id} and user_id=${userId}`;
      await this.updateWorkflow(tx, workflow, "completed", "completed", {
        ...workflow.checkpoint, lastMessageId: messageId
      }, now, now);
      await event(tx, {
        userId, eventType: "task_completed", aggregateType: "task", aggregateId: task.id,
        occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
        idempotencyKey: `focus-task-complete:${messageId}`,
        payload: { previous_status: task.status, next_status: "DONE", source: "discord", changed_at: now.toISOString(), actual_minutes: minutes }
      });
      await event(tx, {
        userId, eventType: "focus_completed", aggregateType: "focus_session", aggregateId: session.id,
        occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
        idempotencyKey: `focus-complete:${messageId}`,
        payload: { result: "task_completed", task_id: task.id, task_title: task.title, actual_minutes: minutes }
      });
      const estimate = task.estimated_user_minutes ?? task.estimated_minutes;
      if (estimate !== null) {
        const delta = task.actual_minutes + minutes - estimate;
        if (delta !== 0) {
          await event(tx, {
            userId, eventType: "replan_triggered", aggregateType: session.plan_item_id ? "plan_item" : "task",
            aggregateId: session.plan_item_id ?? task.id, occurredAt: now, correlationId: workflow.correlationId,
            workflowRunId: workflow.id, idempotencyKey: `focus-complete-replan:${messageId}`,
            payload: {
              reason: delta > 0 ? "task_overrun" : "task_completed_early",
              delta_minutes: delta,
              replan_executed: false
            }
          });
        }
      }
      return { kind: "task_completed", taskTitle: task.title, nextAction: await deriveCurrentAction(tx, userId, planDate) };
    });
  }

  async requestBlockReason(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null> {
    return this.sql.begin(async (tx) => {
      const state = await this.lockActive(tx, userId);
      if (!state) return null;
      const minutes = elapsedMinutes(state.session.started_at, now);
      await tx`
        update public.focus_sessions set status='paused',paused_at=${now},end_reason='blocked',actual_minutes=actual_minutes+${minutes}
        where id=${state.session.id} and user_id=${userId}
      `;
      await tx`update public.tasks set actual_minutes=actual_minutes+${minutes},updated_at=${now} where id=${state.session.task_id} and user_id=${userId}`;
      if (state.session.plan_item_id) await tx`update public.plan_items set status='paused',updated_at=${now} where id=${state.session.plan_item_id} and user_id=${userId}`;
      await this.updateWorkflow(tx, state.workflow, "awaiting_block_reason", "waiting_for_user", {
        ...state.workflow.checkpoint, lastMessageId: messageId
      }, now);
      await event(tx, {
        userId, eventType: "focus_paused", aggregateType: "focus_session", aggregateId: state.session.id,
        occurredAt: now, correlationId: state.workflow.correlationId, workflowRunId: state.workflow.id,
        idempotencyKey: `focus-block-request:${messageId}`,
        payload: { reason: "block_reason_pending", actual_minutes: minutes }
      });
      return this.getContext(tx, userId, state.session.id);
    });
  }

  async waitForBlockDetail(
    userId: UserId,
    category: "missing_material" | "other",
    initialDetail: string,
    now: Date,
    messageId: string
  ): Promise<void> {
    await this.sql.begin(async (tx) => {
      const workflow = await this.lockWorkflow(tx, userId);
      if (!workflow || workflow.currentStep !== "awaiting_block_reason") return;
      await this.updateWorkflow(tx, workflow, category === "missing_material" ? "awaiting_missing_detail" : "awaiting_other_detail", "waiting_for_user", {
        ...workflow.checkpoint, blockCategory: category, blockDetail: initialDetail, lastMessageId: messageId
      }, now);
    });
  }

  async recordBlock(
    userId: UserId,
    planDate: string,
    category: BlockCategory,
    detail: string,
    now: Date,
    messageId: string
  ): Promise<RecoveryResult | null> {
    return this.sql.begin(async (tx) => {
      const workflow = await this.lockWorkflow(tx, userId);
      if (!workflow || !["awaiting_block_reason", "awaiting_missing_detail", "awaiting_other_detail"].includes(workflow.currentStep)) return null;
      const sessions = await tx<SessionRow[]>`select * from public.focus_sessions where id=${workflow.checkpoint.sessionId} and user_id=${userId} and status='paused' for update`;
      const session = sessions[0];
      if (!session) return null;
      const context = await this.getContext(tx, userId, session.id);
      if (!context) return null;
      if (category === "missing_material") {
        const tasks = await tx<{ status: string }[]>`select status from public.tasks where id=${session.task_id} and user_id=${userId} for update`;
        const previous = tasks[0]?.status;
        if (!previous) return null;
        if (previous !== "BLOCKED") {
          assertTaskTransition(previous as Parameters<typeof assertTaskTransition>[0], "BLOCKED");
          await tx`update public.tasks set status='BLOCKED',updated_at=${now} where id=${session.task_id} and user_id=${userId}`;
          await event(tx, {
            userId, eventType: "task_blocked", aggregateType: "task", aggregateId: session.task_id,
            occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
            idempotencyKey: `focus-task-blocked:${messageId}`,
            payload: { previous_status: previous, next_status: "BLOCKED", reason: detail, category, source: "discord", changed_at: now.toISOString() }
          });
          await event(tx, {
            userId, eventType: "replan_triggered", aggregateType: session.plan_item_id ? "plan_item" : "task",
            aggregateId: session.plan_item_id ?? session.task_id, occurredAt: now, correlationId: workflow.correlationId,
            workflowRunId: workflow.id, idempotencyKey: `focus-blocked-replan:${messageId}`,
            payload: { reason: "task_blocked", delta_minutes: 0, replan_executed: false }
          });
        }
        if (session.plan_item_id) await tx`update public.plan_items set status='blocked',updated_at=${now} where id=${session.plan_item_id} and user_id=${userId}`;
      }
      const nextCheckpoint: FocusCheckpoint = {
        ...workflow.checkpoint,
        blockCategory: category,
        blockDetail: detail,
        ...(category === "hard" ? { pendingStepSplit: true } : {}),
        lastMessageId: messageId
      };
      await this.updateWorkflow(tx, workflow, "recovery_ready", "waiting_for_user", nextCheckpoint, now);
      await event(tx, {
        userId, eventType: "focus_blocked", aggregateType: "focus_session", aggregateId: session.id,
        occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
        idempotencyKey: `focus-blocked:${messageId}`, payload: { category, detail }
      });
      return { context, category, detail, nextAction: await deriveCurrentAction(tx, userId, planDate) };
    });
  }

  async resume(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null> {
    return this.sql.begin(async (tx) => {
      const workflow = await this.lockWorkflow(tx, userId);
      if (!workflow || workflow.currentStep !== "recovery_ready") return null;
      const previousSessions = await tx<SessionRow[]>`select * from public.focus_sessions where id=${workflow.checkpoint.sessionId} and user_id=${userId} and status='paused' for update`;
      const previousSession = previousSessions[0];
      if (!previousSession) return null;
      let currentStepId = previousSession.current_step_id;
      if (workflow.checkpoint.pendingStepSplit && currentStepId) {
        currentStepId = await this.splitCurrentStep(tx, userId, previousSession.task_id, currentStepId, now);
      }
      const tasks = await tx<{ status: string }[]>`select status from public.tasks where id=${previousSession.task_id} and user_id=${userId} for update`;
      const previousStatus = tasks[0]?.status;
      if (!previousStatus) return null;
      if (previousStatus === "BLOCKED" || previousStatus === "WAITING_FOR_USER") {
        assertTaskTransition(previousStatus as Parameters<typeof assertTaskTransition>[0], "IN_PROGRESS");
        await tx`update public.tasks set status='IN_PROGRESS',updated_at=${now} where id=${previousSession.task_id} and user_id=${userId}`;
        await event(tx, {
          userId, eventType: "task_resumed", aggregateType: "task", aggregateId: previousSession.task_id,
          occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
          idempotencyKey: `focus-task-resumed:${messageId}`,
          payload: { previous_status: previousStatus, next_status: "IN_PROGRESS", source: "discord", changed_at: now.toISOString() }
        });
      }
      const sessions = await tx<SessionRow[]>`
        insert into public.focus_sessions(user_id,task_id,plan_item_id,current_step_id,status,started_at)
        values(${userId},${previousSession.task_id},${previousSession.plan_item_id},${currentStepId},'active',${now}) returning *
      `;
      const session = sessions[0]!;
      if (session.current_step_id) {
        await tx`update public.task_steps set status='in_progress',updated_at=${now} where id=${session.current_step_id} and user_id=${userId}`;
      }
      if (session.plan_item_id) await tx`update public.plan_items set status='in_progress',updated_at=${now} where id=${session.plan_item_id} and user_id=${userId}`;
      await this.updateWorkflow(tx, workflow, "active", "running", {
        sessionId: session.id,
        taskId: session.task_id,
        planItemId: session.plan_item_id,
        lastMessageId: messageId
      }, now);
      await event(tx, {
        userId, eventType: "focus_resumed", aggregateType: "focus_session", aggregateId: session.id,
        occurredAt: now, correlationId: workflow.correlationId, workflowRunId: workflow.id,
        idempotencyKey: `focus-resumed:${messageId}`, payload: { previous_session_id: previousSession.id }
      });
      return this.getContext(tx, userId, session.id);
    });
  }

  async requestSwitch(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null> {
    return this.sql.begin(async (tx) => {
      const state = await this.lockActive(tx, userId);
      if (!state) return null;
      await this.updateWorkflow(tx, state.workflow, "awaiting_switch_confirmation", "waiting_for_user", {
        ...state.workflow.checkpoint, lastMessageId: messageId
      }, now);
      await event(tx, {
        userId, eventType: "task_switch_requested", aggregateType: "task", aggregateId: state.session.task_id,
        occurredAt: now, correlationId: state.workflow.correlationId, workflowRunId: state.workflow.id,
        idempotencyKey: `focus-switch-request:${messageId}`, payload: { session_id: state.session.id }
      });
      return this.getContext(tx, userId, state.session.id);
    });
  }

  async confirmSwitch(userId: UserId, planDate: string, now: Date, messageId: string): Promise<SwitchResult | null> {
    return this.sql.begin(async (tx) => {
      const state = await this.lockActive(tx, userId);
      if (!state || state.workflow.currentStep !== "awaiting_switch_confirmation") return null;
      const tasks = await tx<{ title: string }[]>`select title from public.tasks where id=${state.session.task_id} and user_id=${userId}`;
      const minutes = elapsedMinutes(state.session.started_at, now);
      await tx`
        update public.focus_sessions set status='paused',paused_at=${now},end_reason='task_switched',actual_minutes=actual_minutes+${minutes}
        where id=${state.session.id} and user_id=${userId}
      `;
      await tx`update public.tasks set actual_minutes=actual_minutes+${minutes},updated_at=${now} where id=${state.session.task_id} and user_id=${userId}`;
      if (state.session.plan_item_id) await tx`update public.plan_items set status='switched',updated_at=${now} where id=${state.session.plan_item_id} and user_id=${userId}`;
      await this.updateWorkflow(tx, state.workflow, "completed", "completed", {
        ...state.workflow.checkpoint, lastMessageId: messageId
      }, now, now);
      await event(tx, {
        userId, eventType: "task_switched", aggregateType: "task", aggregateId: state.session.task_id,
        occurredAt: now, correlationId: state.workflow.correlationId, workflowRunId: state.workflow.id,
        idempotencyKey: `focus-switched:${messageId}`, payload: { task_status: "IN_PROGRESS", actual_minutes: minutes }
      });
      await event(tx, {
        userId, eventType: "replan_triggered", aggregateType: state.session.plan_item_id ? "plan_item" : "task", aggregateId: state.session.plan_item_id ?? state.session.task_id,
        occurredAt: now, correlationId: state.workflow.correlationId, workflowRunId: state.workflow.id,
        idempotencyKey: `focus-switch-replan:${messageId}`, payload: { reason: "task_switched", replan_executed: false }
      });
      return { previousTaskTitle: tasks[0]?.title ?? "현재 Task", nextAction: await deriveCurrentAction(tx, userId, planDate) };
    });
  }

  private async lockActive(sql: Sql, userId: UserId): Promise<{ session: SessionRow; workflow: FocusWorkflowRun } | null> {
    const sessions = await sql<SessionRow[]>`select * from public.focus_sessions where user_id=${userId} and status='active' limit 1 for update`;
    const session = sessions[0];
    if (!session) return null;
    const workflows = await sql<WorkflowRow[]>`
      select * from public.workflow_runs where user_id=${userId} and workflow_type='focus'
        and checkpoint_state->>'sessionId'=${session.id} order by updated_at desc limit 1 for update
    `;
    return workflows[0] ? { session, workflow: mapWorkflow(workflows[0]) } : null;
  }

  private async lockWorkflow(sql: Sql, userId: UserId): Promise<FocusWorkflowRun | null> {
    const rows = await sql<WorkflowRow[]>`
      select * from public.workflow_runs where user_id=${userId} and workflow_type='focus'
        and status in ('running','waiting_for_user') order by updated_at desc limit 1 for update
    `;
    return rows[0] ? mapWorkflow(rows[0]) : null;
  }

  private async updateWorkflow(
    sql: Sql,
    workflow: FocusWorkflowRun,
    step: FocusWorkflowStep,
    status: FocusWorkflowRun["status"],
    checkpoint: FocusCheckpoint,
    now: Date,
    completedAt: Date | null = null
  ): Promise<void> {
    await sql`
      update public.workflow_runs set status=${status},current_step=${step},checkpoint_state=${sql.json(checkpoint as unknown as JSONValue)},
        checkpoint_version=checkpoint_version+1,updated_at=${now},completed_at=${completedAt}
      where id=${workflow.id} and user_id=${workflow.userId}
    `;
  }

  private async getContext(sql: Sql, userId: UserId, sessionId: string): Promise<FocusContext | null> {
    const sessions = await sql<SessionRow[]>`select * from public.focus_sessions where id=${sessionId} and user_id=${userId}`;
    const session = sessions[0];
    if (!session) return null;
    const tasks = await sql<TaskRow[]>`
      select id,title,status,completion_criteria,estimated_minutes,estimated_user_minutes,actual_minutes,next_action
      from public.tasks where id=${session.task_id} and user_id=${userId}
    `;
    const task = tasks[0];
    if (!task) return null;
    const rows = await sql<StepRow[]>`
      select id,position,title,owner,estimated_minutes,completion_criteria,status from public.task_steps
      where task_id=${task.id} and user_id=${userId} order by position
    `;
    const steps = rows.map(mapStep);
    const currentStep = steps.find((step) => step.id === session.current_step_id)
      ?? steps.find((step) => step.status !== "completed")
      ?? null;
    return {
      sessionId: session.id,
      taskId: task.id,
      planItemId: session.plan_item_id,
      taskTitle: task.title,
      taskCompletionCriteria: task.completion_criteria,
      estimatedMinutes: task.estimated_user_minutes ?? task.estimated_minutes,
      nextAction: task.next_action,
      steps,
      currentStep
    };
  }

  private async splitCurrentStep(sql: Sql, userId: UserId, taskId: string, stepId: string, now: Date): Promise<string> {
    const rows = await sql<StepRow[]>`
      select id,position,title,owner,estimated_minutes,completion_criteria,status from public.task_steps
      where id=${stepId} and task_id=${taskId} and user_id=${userId} for update
    `;
    const step = rows[0];
    if (!step) return stepId;
    await sql`update public.task_steps set position=position+1000 where task_id=${taskId} and user_id=${userId} and position>${step.position}`;
    await sql`update public.task_steps set position=position-999 where task_id=${taskId} and user_id=${userId} and position>${step.position + 1000}`;
    const firstMinutes = step.estimated_minutes === null ? null : Math.max(1, Math.ceil(step.estimated_minutes / 2));
    const secondMinutes = step.estimated_minutes === null ? null : Math.max(0, step.estimated_minutes - firstMinutes!);
    await sql`
      update public.task_steps set title=${`${step.title} (1/2)`},estimated_minutes=${firstMinutes},completion_criteria=null,updated_at=${now}
      where id=${step.id} and user_id=${userId}
    `;
    await sql`
      insert into public.task_steps(user_id,task_id,position,title,owner,estimated_minutes,completion_criteria,status)
      values(${userId},${taskId},${step.position + 1},${`${step.title} (2/2)`},${step.owner},${secondMinutes},${step.completion_criteria},'pending')
    `;
    return step.id;
  }

}
