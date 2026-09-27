import { randomUUID } from "node:crypto";
import type { CorrelationId, TaskId, UserId } from "@amber/shared";
import type { JSONValue, Sql, TransactionSql } from "postgres";
import { deriveLearningRecovery, type LearningRecoveryProposal } from "./learning-recovery.js";
import type { LearningTaskExecutionCommand, LearningTaskProposal } from "./learning-task-execution.js";
import type { LearningRecoveryMode } from "./learning-v2.js";
import { canTransitionTask } from "../task/task-state-machine.js";
import type { TaskStatus } from "../task/task.js";

interface MaterializedRow { task_id: string; target_id: string; status: string }
interface TargetRow {
  id: string;
  task_id: string;
  material_id: string;
  start_sequence: number | null;
  end_sequence: number | null;
  assigned_units: number | null;
  completed_units: number;
  completed_through_sequence: number | null;
  execution_status: "PENDING" | "COMPLETED" | "PARTIAL" | "SKIPPED" | "CANCELLED";
  resolved_at: Date | null;
  recovery_mode: LearningRecoveryMode | null;
  materialization_key: string | null;
  task_status: TaskStatus;
}
interface UnitRow {
  id: string;
  sequence_no: number;
  exposure_state: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  understanding_state: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  validation_state: "NOT_TESTED" | "FAILED" | "PASSED";
}

export interface LearningTaskMaterializationResult {
  readonly kind: "created" | "existing" | "overlap";
  readonly taskId: string;
  readonly targetId: string;
}

export interface LearningTaskExecutionResult {
  readonly duplicate: boolean;
  readonly task: { readonly taskId: string; readonly previousStatus: TaskStatus; readonly nextStatus: TaskStatus };
  readonly target: {
    readonly targetId: string;
    readonly assignedUnits: number;
    readonly completedUnits: number;
    readonly startSequence: number | null;
    readonly endSequence: number | null;
    readonly completedThroughSequence: number | null;
    readonly executionStatus: Exclude<TargetRow["execution_status"], "PENDING">;
  };
  readonly affectedUnits: readonly {
    readonly learningUnitId: string;
    readonly sequenceNo: number;
    readonly exposureBefore: UnitRow["exposure_state"];
    readonly exposureAfter: "COMPLETE";
    readonly understandingUnchanged: UnitRow["understanding_state"];
    readonly validationUnchanged: UnitRow["validation_state"];
  }[];
  readonly nextIncompleteSequence: number | null;
  readonly materialStatus: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  readonly recovery: LearningRecoveryProposal | null;
}

const json = (tx: TransactionSql, value: unknown) => tx.json(value as JSONValue);
const terminalStatuses = ["DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"] as const;

export class SupabaseLearningTaskExecutionRepository {
  constructor(private readonly sql: Sql) {}

  materialize(userId: UserId, proposal: LearningTaskProposal, occurredAt = new Date(), correlationId = randomUUID() as CorrelationId): Promise<LearningTaskMaterializationResult> {
    return this.sql.begin(async (tx) => {
      if (!Number.isInteger(proposal.assignedUnits) || proposal.assignedUnits <= 0) throw new Error("Assigned units must be a positive integer");
      if ((proposal.startSequence === null) !== (proposal.endSequence === null)) throw new Error("Bounded targets require both start and end sequences");
      await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:learning-task:${proposal.materialId}`}))`;
      const existing = await tx<MaterializedRow[]>`
        select x.task_id,x.id target_id,t.status from public.task_learning_targets x
        join public.tasks t on t.id=x.task_id and t.user_id=x.user_id
        where x.user_id=${userId} and x.materialization_key=${proposal.materializationKey} limit 1`;
      if (existing[0]) return { kind: "existing", taskId: existing[0].task_id, targetId: existing[0].target_id };
      const overlap = proposal.startSequence === null
        ? await tx<MaterializedRow[]>`
          select x.task_id,x.id target_id,t.status from public.task_learning_targets x
          join public.tasks t on t.id=x.task_id and t.user_id=x.user_id
          where x.user_id=${userId} and x.material_id=${proposal.materialId} and x.execution_status='PENDING'
            and t.status not in ('DONE','CLOSED_PARTIAL','SKIPPED','CANCELLED') limit 1 for update of x,t`
        : await tx<MaterializedRow[]>`
          select x.task_id,x.id target_id,t.status from public.task_learning_targets x
          join public.tasks t on t.id=x.task_id and t.user_id=x.user_id
          where x.user_id=${userId} and x.material_id=${proposal.materialId} and x.execution_status='PENDING'
            and (x.start_sequence is null or x.end_sequence is null
              or (x.start_sequence<=${proposal.endSequence} and x.end_sequence>=${proposal.startSequence}))
            and t.status not in ('DONE','CLOSED_PARTIAL','SKIPPED','CANCELLED') limit 1 for update of x,t`;
      if (overlap[0]) return { kind: "overlap", taskId: overlap[0].task_id, targetId: overlap[0].target_id };
      const material = await tx<{ id: string }[]>`
        select id from public.learning_materials where id=${proposal.materialId} and user_id=${userId}
          and work_context_id=${proposal.workContextId} and (stage_id is null or stage_id=${proposal.stageId})`;
      if (!material[0]) throw new Error("Learning material does not belong to the proposed Context/Stage");
      if (proposal.startSequence !== null) {
        const bounded = await tx<{ count: number }[]>`
          select count(*)::integer count from public.learning_units
          where user_id=${userId} and work_context_id=${proposal.workContextId}
            and (stage_id is null or stage_id=${proposal.stageId})
            and material_id=${proposal.materialId} and sequence_no between ${proposal.startSequence} and ${proposal.endSequence}
            and exposure_state<>'COMPLETE'`;
        if (bounded[0]?.count !== proposal.assignedUnits) throw new Error("Bounded proposal no longer matches incomplete Learning Units");
      }
      const tasks = await tx<{ id: string }[]>`
        insert into public.tasks(user_id,work_context_id,title,execution_mode,planned_date,importance,status,completion_criteria)
        values(${userId},${proposal.workContextId},${proposal.title},'learning_required',${proposal.planDate},${proposal.importance},'PLANNED',${proposal.completionCriteria})
        returning id`;
      const taskId = tasks[0]!.id;
      const targets = await tx<{ id: string }[]>`
        insert into public.task_learning_targets(user_id,task_id,material_id,start_sequence,end_sequence,allocation_policy_id,
          assigned_units,completed_units,execution_status,recovery_mode,materialization_key)
        values(${userId},${taskId},${proposal.materialId},${proposal.startSequence},${proposal.endSequence},${proposal.allocationPolicyId},
          ${proposal.assignedUnits},0,'PENDING',${proposal.recoveryMode},${proposal.materializationKey}) returning id`;
      await this.event(tx, userId, taskId, "task_created", occurredAt, correlationId,
        `${proposal.materializationKey}:task-created`, { previous_status: null, next_status: "PLANNED",
          source: "learning_allocation", changed_at: occurredAt.toISOString(), title: proposal.title });
      await this.event(tx, userId, taskId, "learning_task_generated", occurredAt, correlationId,
        `${proposal.materializationKey}:generated`, { source: proposal.source, material_id: proposal.materialId,
          allocation_policy_id: proposal.allocationPolicyId, allocation_policy_name: proposal.allocationPolicyName,
          assigned_units: proposal.assignedUnits,
          start_sequence: proposal.startSequence, end_sequence: proposal.endSequence, reasons: proposal.reasons });
      return { kind: "created", taskId, targetId: targets[0]!.id };
    });
  }

  applyExecution(input: {
    readonly userId: UserId;
    readonly taskId: TaskId;
    readonly targetId: string;
    readonly command: LearningTaskExecutionCommand;
    readonly occurredAt?: Date;
    readonly correlationId?: CorrelationId;
  }): Promise<LearningTaskExecutionResult> {
    return this.sql.begin(async (tx) => {
      const occurredAt = input.occurredAt ?? new Date();
      const correlationId = input.correlationId ?? randomUUID() as CorrelationId;
      const rows = await tx<TargetRow[]>`
        select x.*,t.status task_status from public.task_learning_targets x
        join public.tasks t on t.id=x.task_id and t.user_id=x.user_id
        where x.id=${input.targetId} and x.task_id=${input.taskId} and x.user_id=${input.userId}
        for update of x,t`;
      const target = rows[0];
      if (!target || target.assigned_units === null) throw new Error("Learning Task target not found or lacks assigned quantity");
      const requestedStatus = input.command.outcome;
      if (target.execution_status !== "PENDING") {
        if (target.execution_status !== requestedStatus) throw new Error("Learning Task target already resolved with a different outcome");
        return this.loadResult(tx, target, target.task_status, target.task_status, true, null,
          this.recoveryFor(target, input.command));
      }
      if (terminalStatuses.includes(target.task_status as typeof terminalStatuses[number])) throw new Error("Task is terminal while Learning target is pending");
      const resolved = this.resolveExecution(target, input.command);
      if (!canTransitionTask(target.task_status, resolved.taskStatus)) throw new Error(`Invalid Learning Task transition: ${target.task_status}->${resolved.taskStatus}`);
      const units = resolved.completedThroughSequence === null ? [] : await tx<UnitRow[]>`
        select id,sequence_no,exposure_state,understanding_state,validation_state from public.learning_units
        where user_id=${input.userId} and material_id=${target.material_id}
          and sequence_no between ${target.start_sequence} and ${resolved.completedThroughSequence}
        order by sequence_no for update`;
      if (resolved.completedThroughSequence !== null && units.length !== resolved.completedUnits) {
        throw new Error("Bounded Learning Unit evidence does not match completed scope");
      }
      if (units.length) await tx`update public.learning_units set exposure_state='COMPLETE',updated_at=${occurredAt}
        where user_id=${input.userId} and material_id=${target.material_id}
          and sequence_no between ${target.start_sequence} and ${resolved.completedThroughSequence}`;
      await tx`update public.task_learning_targets set completed_units=${resolved.completedUnits},
        completed_through_sequence=${resolved.completedThroughSequence},execution_status=${resolved.executionStatus},resolved_at=${occurredAt}
        where id=${target.id} and user_id=${input.userId}`;
      await tx`update public.tasks set status=${resolved.taskStatus},
        completed_at=${resolved.taskStatus === "DONE" || resolved.taskStatus === "CLOSED_PARTIAL" ? occurredAt : null},
        completion_source='learning_execution',updated_at=${occurredAt}
        where id=${target.task_id} and user_id=${input.userId}`;
      if (units.length) await tx`update public.learning_materials m set status='COMPLETED',updated_at=${occurredAt}
        where m.id=${target.material_id} and m.user_id=${input.userId}
          and not exists(select 1 from public.learning_units u where u.user_id=m.user_id and u.material_id=m.id and u.exposure_state<>'COMPLETE')`;
      const eventKey = target.materialization_key ?? `learning-target:${target.id}`;
      await this.event(tx, input.userId, target.task_id, resolved.taskEvent, occurredAt, correlationId,
        `${eventKey}:task-outcome`, { previous_status: target.task_status, next_status: resolved.taskStatus, source: "learning_execution" });
      await this.event(tx, input.userId, target.task_id, resolved.learningEvent, occurredAt, correlationId,
        `${eventKey}:learning-outcome`, { material_id: target.material_id, assigned_units: target.assigned_units,
          completed_units: resolved.completedUnits, start_sequence: target.start_sequence, end_sequence: target.end_sequence,
          completed_through_sequence: resolved.completedThroughSequence, execution_status: resolved.executionStatus,
          affected_learning_unit_ids: units.map((unit) => unit.id) });
      const refreshed: TargetRow = { ...target, completed_units: resolved.completedUnits,
        completed_through_sequence: resolved.completedThroughSequence, execution_status: resolved.executionStatus,
        resolved_at: occurredAt, task_status: resolved.taskStatus };
      return this.loadResult(tx, refreshed, target.task_status, resolved.taskStatus, false, units,
        this.recoveryFor(refreshed, input.command));
    });
  }

  private resolveExecution(target: TargetRow, command: LearningTaskExecutionCommand): {
    completedUnits: number; completedThroughSequence: number | null;
    executionStatus: Exclude<TargetRow["execution_status"], "PENDING">; taskStatus: TaskStatus;
    taskEvent: string; learningEvent: string;
  } {
    if (command.outcome === "COMPLETED") return { completedUnits: target.assigned_units!,
      completedThroughSequence: target.end_sequence, executionStatus: "COMPLETED", taskStatus: "DONE",
      taskEvent: "task_completed", learningEvent: "learning_scope_completed" };
    if (command.outcome === "SKIPPED") return { completedUnits: 0, completedThroughSequence: null,
      executionStatus: "SKIPPED", taskStatus: "SKIPPED", taskEvent: "task_skipped", learningEvent: "learning_scope_skipped" };
    if (command.outcome === "CANCELLED") return { completedUnits: 0, completedThroughSequence: null,
      executionStatus: "CANCELLED", taskStatus: "CANCELLED", taskEvent: "task_cancelled", learningEvent: "learning_scope_cancelled" };
    if (target.start_sequence === null && command.completedThroughSequence != null) {
      throw new Error("Open-ended quantity completion cannot contain a sequence");
    }
    const completedUnits = command.completedUnits
      ?? (target.start_sequence !== null && command.completedThroughSequence != null
        ? command.completedThroughSequence - target.start_sequence + 1 : null);
    if (completedUnits === null || !Number.isInteger(completedUnits) || completedUnits <= 0 || completedUnits >= target.assigned_units!) {
      throw new Error("Partial completion must be between zero and assigned units");
    }
    const through = target.start_sequence === null ? null : target.start_sequence + completedUnits - 1;
    if (command.completedThroughSequence != null && command.completedThroughSequence !== through) {
      throw new Error("Partial completed-through sequence does not match completed units");
    }
    return { completedUnits, completedThroughSequence: through,
      executionStatus: "PARTIAL", taskStatus: "CLOSED_PARTIAL", taskEvent: "task_closed_partial",
      learningEvent: "learning_scope_partially_completed" };
  }

  private async loadResult(
    tx: TransactionSql,
    target: TargetRow,
    previousStatus: TaskStatus,
    nextStatus: TaskStatus,
    duplicate: boolean,
    suppliedUnits: readonly UnitRow[] | null,
    recovery: LearningRecoveryProposal | null
  ): Promise<LearningTaskExecutionResult> {
    const units = suppliedUnits ?? (target.completed_through_sequence === null ? [] : await tx<UnitRow[]>`
      select id,sequence_no,exposure_state,understanding_state,validation_state from public.learning_units
      where user_id=(select user_id from public.task_learning_targets where id=${target.id}) and material_id=${target.material_id}
        and sequence_no between ${target.start_sequence} and ${target.completed_through_sequence} order by sequence_no`);
    const next = await tx<{ sequence_no: number }[]>`
      select sequence_no from public.learning_units
      where user_id=(select user_id from public.task_learning_targets where id=${target.id}) and material_id=${target.material_id}
        and sequence_no is not null and exposure_state<>'COMPLETE' order by sequence_no limit 1`;
    const materials = await tx<{ status: "ACTIVE" | "COMPLETED" | "ARCHIVED" }[]>`
      select status from public.learning_materials where id=${target.material_id}
        and user_id=(select user_id from public.task_learning_targets where id=${target.id})`;
    if (!materials[0]) throw new Error("Learning material not found while loading execution result");
    return {
      duplicate,
      task: { taskId: target.task_id, previousStatus, nextStatus },
      target: { targetId: target.id, assignedUnits: target.assigned_units!, completedUnits: target.completed_units,
        startSequence: target.start_sequence, endSequence: target.end_sequence,
        completedThroughSequence: target.completed_through_sequence,
        executionStatus: target.execution_status as Exclude<TargetRow["execution_status"], "PENDING"> },
      affectedUnits: units.map((unit) => ({ learningUnitId: unit.id, sequenceNo: unit.sequence_no,
        exposureBefore: duplicate ? unit.exposure_state : unit.exposure_state, exposureAfter: "COMPLETE",
        understandingUnchanged: unit.understanding_state, validationUnchanged: unit.validation_state })),
      nextIncompleteSequence: next[0]?.sequence_no ?? null,
      materialStatus: materials[0].status,
      recovery
    };
  }

  private recoveryFor(target: TargetRow, command: LearningTaskExecutionCommand): LearningRecoveryProposal | null {
    if (command.outcome !== "SKIPPED" || !target.recovery_mode) return null;
    return deriveLearningRecovery({ recoveryMode: target.recovery_mode, normalTargetUnits: target.assigned_units!,
      missedUnits: target.assigned_units!, existingPendingUnits: command.existingPendingUnits,
      carryForwardLimitUnits: command.carryForwardLimitUnits });
  }

  private async event(
    tx: TransactionSql, userId: UserId, taskId: string, eventType: string, occurredAt: Date,
    correlationId: CorrelationId, idempotencyKey: string, payload: unknown
  ): Promise<void> {
    await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,
      correlation_id,idempotency_key,payload_version,payload)
      values(${userId},${eventType},'task',${taskId},'system',${occurredAt},${correlationId},${idempotencyKey},1,${json(tx, payload)})
      on conflict(user_id,idempotency_key) do nothing`;
  }
}
