import { createHash } from "node:crypto";
import { DomainError, type UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import {
  backlogApprovalDecisionSchema,
  type BacklogApprovalRecord,
  type BacklogApprovalRepository,
  type BacklogApprovalResult,
  type MaterializedTask,
  type MaterializedTaskStep
} from "./backlog-approval.js";
import { backlogProposalArtifactSchema, projectStateSnapshotSchema } from "./project-leadership.js";
import { contentHash, projectStateFingerprint } from "./project-state-projector.js";
import { routeStep } from "./work-routing.js";

const WORKFLOW_TYPE = "backlog_approval_materialization";
const ACTION_TYPE = "materialize_backlog_proposal";

interface ApprovalRow {
  id: string;
  user_id: string;
  workflow_run_id: string;
  action_ref: string;
  action_hash: string;
  checkpoint_version: number;
  status: BacklogApprovalRecord["status"];
  checkpoint_state: Record<string, unknown>;
}

interface TaskStepRow { id: string; task_id: string; position: number; title: string; owner: "user" | "ai"; status: string }

const stableUuid = (value: string): string => {
  const chars = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 3) | 8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const priorityImportance = { low: 2, medium: 3, high: 4, critical: 5 } as const;
const roughMinutes = { xs: 15, s: 30, m: 60, l: 120, xl: 240 } as const;

export class SupabaseBacklogApprovalRepository implements BacklogApprovalRepository {
  constructor(private readonly sql: Sql) {}

  async requestApproval(input: Parameters<BacklogApprovalRepository["requestApproval"]>[0]): Promise<BacklogApprovalRecord> {
    const workflowRunId = await this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:backlog-approval:${input.proposalArtifactId}`},0))`;
      const proposalApproval = await tx<{ workflow_run_id: string }[]>`
        select workflow_run_id from public.approval_requests where user_id=${input.userId}
          and action_type=${ACTION_TYPE} and action_ref=${input.proposalArtifactId} order by created_at limit 1
      `;
      if (proposalApproval[0]) return proposalApproval[0].workflow_run_id;
      const existing = await tx<{ id: string }[]>`
        select id from public.workflow_runs where user_id=${input.userId} and idempotency_key=${input.idempotencyKey}
      `;
      if (existing[0]) return existing[0].id;
      const proposalRows = await tx<{ id: string; work_context_id: string | null; content_text: string; content_hash: string }[]>`
        select id,work_context_id,content_text,content_hash from public.artifacts
        where id=${input.proposalArtifactId} and user_id=${input.userId} and artifact_type='backlog_proposal' for share
      `;
      const proposalRow = proposalRows[0];
      if (!proposalRow || !proposalRow.work_context_id) throw new DomainError("INVALID_INPUT", "Backlog proposal artifact not found");
      if (proposalRow.content_hash !== input.proposalHash) throw new DomainError("CONFLICT", "Backlog proposal hash does not match");
      const proposal = backlogProposalArtifactSchema.parse(JSON.parse(proposalRow.content_text));
      if (proposal.workContextId !== proposalRow.work_context_id) throw new DomainError("CONFLICT", "Backlog proposal scope does not match its artifact");
      const snapshots = await tx<{ id: string; content_text: string; content_hash: string }[]>`
        select id,content_text,content_hash from public.artifacts where id=${proposal.sourceSnapshotArtifactId}
          and user_id=${input.userId} and work_context_id=${proposal.workContextId} and artifact_type='project_state_snapshot' for share
      `;
      const snapshotRow = snapshots[0];
      if (!snapshotRow) throw new DomainError("CONFLICT", "Backlog proposal source snapshot is missing");
      const snapshot = projectStateSnapshotSchema.parse(JSON.parse(snapshotRow.content_text));
      const sourceRuns = await tx<{ id: string; correlation_id: string }[]>`
        select id,correlation_id from public.workflow_runs where user_id=${input.userId}
          and checkpoint_state->>'backlogProposalArtifactId'=${input.proposalArtifactId} order by completed_at desc limit 1
      `;
      if (!sourceRuns[0]) throw new DomainError("CONFLICT", "Backlog proposal source workflow is missing");
      const checkpoint = {
        workContextId: proposal.workContextId,
        proposalArtifactId: proposalRow.id,
        proposalHash: proposalRow.content_hash,
        sourceWorkflowRunId: sourceRuns[0].id,
        sourceSnapshotArtifactId: snapshotRow.id,
        sourceSnapshotHash: snapshotRow.content_hash,
        sourceSnapshotFingerprint: projectStateFingerprint(snapshot),
        approvalCheckpointVersion: 1
      };
      const workflows = await tx<{ id: string }[]>`
        insert into public.workflow_runs(user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,
          idempotency_key,correlation_id,started_at,updated_at)
        values(${input.userId},${WORKFLOW_TYPE},'waiting_for_user','AWAITING_APPROVAL',${tx.json(checkpoint)},1,
          ${input.idempotencyKey},${sourceRuns[0].correlation_id},${input.now},${input.now}) returning id
      `;
      const workflowRunId = workflows[0]!.id;
      const approvals = await tx<{ id: string }[]>`
        insert into public.approval_requests(user_id,workflow_run_id,action_type,action_ref,action_hash,checkpoint_version,
          status,requested_at,resume_idempotency_key)
        values(${input.userId},${workflowRunId},${ACTION_TYPE},${proposalRow.id},${proposalRow.content_hash},1,
          'pending',${input.now},${`backlog-materialize:${proposalRow.id}`}) returning id
      `;
      const requestEvents = await tx<{ id: string }[]>`
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,
          correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
        values(${input.userId},'decision_requested','artifact',${proposalRow.id},'system',${input.now},${sourceRuns[0].correlation_id},
          ${workflowRunId},${`backlog-approval-requested:${proposalRow.id}`},1,
          ${tx.json({ proposal_artifact_id: proposalRow.id, proposal_hash: proposalRow.content_hash, work_context_id: proposal.workContextId })})
        on conflict(user_id,idempotency_key) do nothing
        returning id
      `;
      await tx`
        update public.workflow_runs set checkpoint_state=checkpoint_state || ${tx.json({ requestEventId: requestEvents[0]!.id })}
        where id=${workflowRunId} and user_id=${input.userId}
      `;
      return workflowRunId;
    });
    const approval = await this.getApprovalByWorkflow(input.userId, workflowRunId);
    if (!approval) throw new Error("Created backlog approval disappeared");
    if (approval.proposalArtifactId !== input.proposalArtifactId || approval.proposalHash !== input.proposalHash) {
      throw new DomainError("CONFLICT", "Approval idempotency key is already bound to another proposal");
    }
    return approval;
  }

  async getApproval(userId: UserId, approvalRequestId: string): Promise<BacklogApprovalRecord | null> {
    const rows = await this.sql<ApprovalRow[]>`
      select a.id,a.user_id,a.workflow_run_id,a.action_ref,a.action_hash,a.checkpoint_version,a.status,w.checkpoint_state
      from public.approval_requests a join public.workflow_runs w on w.id=a.workflow_run_id and w.user_id=a.user_id
      where a.id=${approvalRequestId} and a.user_id=${userId} and a.action_type=${ACTION_TYPE}
    `;
    return rows[0] ? this.mapApproval(rows[0]) : null;
  }

  async expireStale(userId: UserId, approvalRequestId: string, now: Date): Promise<void> {
    await this.sql.begin(async (tx) => {
      const approvals = await tx<{ workflow_run_id: string }[]>`
        update public.approval_requests set status='expired',responded_at=${now},responded_by='system',
          response_payload=${tx.json({ reason: "project_state_changed" })}
        where id=${approvalRequestId} and user_id=${userId} and action_type=${ACTION_TYPE} and status='pending'
        returning workflow_run_id
      `;
      if (!approvals[0]) return;
      await tx`
        update public.workflow_runs set status='failed',current_step='STALE',checkpoint_version=checkpoint_version+1,
          checkpoint_state=checkpoint_state || ${tx.json({ staleAt: now.toISOString() })},updated_at=${now},completed_at=${now}
        where id=${approvals[0].workflow_run_id} and user_id=${userId}
      `;
    });
  }

  async materialize(input: Parameters<BacklogApprovalRepository["materialize"]>[0]): Promise<BacklogApprovalResult> {
    const decision = backlogApprovalDecisionSchema.parse(input.decision);
    const duplicate = await this.sql.begin(async (tx) => {
      const rows = await tx<ApprovalRow[]>`
        select a.id,a.user_id,a.workflow_run_id,a.action_ref,a.action_hash,a.checkpoint_version,a.status,w.checkpoint_state
        from public.approval_requests a join public.workflow_runs w on w.id=a.workflow_run_id and w.user_id=a.user_id
        where a.id=${input.approval.id} and a.user_id=${input.approval.userId} for update
      `;
      const approval = rows[0];
      if (!approval) throw new DomainError("INVALID_INPUT", "Backlog approval request not found");
      const decisionHash = contentHash(decision);
      if (approval.status === "approved") {
        if (approval.checkpoint_state.decisionHash !== decisionHash) {
          throw new DomainError("CONFLICT", "Approved backlog decision cannot be changed during retry");
        }
        return true;
      }
      if (approval.status !== "pending") throw new DomainError("CONFLICT", "Backlog approval request is not pending");
      if (approval.action_ref !== decision.proposalArtifactId || approval.action_hash !== decision.proposalHash
        || approval.checkpoint_version !== Number(approval.checkpoint_state.approvalCheckpointVersion)) {
        throw new DomainError("CONFLICT", "Backlog approval binding is stale");
      }
      if (input.currentStateFingerprint !== approval.checkpoint_state.sourceSnapshotFingerprint) {
        throw new DomainError("CONFLICT", "Project state changed before materialization");
      }
      const proposals = await tx<{ content_text: string; content_hash: string; work_context_id: string }[]>`
        select content_text,content_hash,work_context_id from public.artifacts where id=${decision.proposalArtifactId}
          and user_id=${decision.userId} and artifact_type='backlog_proposal' for share
      `;
      const proposalRow = proposals[0];
      if (!proposalRow || proposalRow.content_hash !== decision.proposalHash) {
        throw new DomainError("CONFLICT", "Backlog proposal changed before materialization");
      }
      const proposal = backlogProposalArtifactSchema.parse(JSON.parse(proposalRow.content_text));
      const snapshots = await tx<{ content_hash: string }[]>`
        select content_hash from public.artifacts where id=${proposal.sourceSnapshotArtifactId} and user_id=${decision.userId}
          and artifact_type='project_state_snapshot' for share
      `;
      if (snapshots[0]?.content_hash !== approval.checkpoint_state.sourceSnapshotHash) {
        throw new DomainError("CONFLICT", "Project source snapshot changed before materialization");
      }
      const decisions = await tx<{ id: string }[]>`
        insert into public.decisions(user_id,workflow_run_id,question,why_now,options,ai_recommendation,impact,status,created_at,resolved_at)
        values(${decision.userId},${approval.workflow_run_id},'백로그 제안을 어떻게 반영할까?','project_backlog_approval',
          ${tx.json({ choices: ["accept", "exclude"], supportsOverrides: ["priority", "owner"] })},
          ${tx.json({ proposalArtifactId: decision.proposalArtifactId, items: proposal.items.map((item) => ({ key: item.key, priority: item.suggestedPriority, owner: item.suggestedOwner })) })},
          ${tx.json({ context: { projectId: proposal.workContextId, proposalArtifactId: decision.proposalArtifactId, approvalRequestId: approval.id } })},
          'resolved',${input.now},${input.now}) returning id
      `;
      const decisionId = decisions[0]!.id;
      await tx`
        insert into public.decision_feedback(user_id,decision_id,user_choice,user_reason)
        values(${decision.userId},${decisionId},${tx.json({ acceptedItems: decision.acceptedItems, excludedItems: decision.excludedItems })},
          ${decision.userReason ?? null})
      `;
      for (const selection of decision.acceptedItems) {
        const item = proposal.items.find((candidate) => candidate.key === selection.proposalItemKey)!;
        const owner = selection.ownerOverride ?? item.suggestedOwner;
        const priority = selection.priorityOverride ?? item.suggestedPriority;
        const taskId = stableUuid(`backlog-task:${decision.proposalArtifactId}:${item.key}`);
        const minutes = item.roughSize ? roughMinutes[item.roughSize] : null;
        const taskExecutionMode = owner === "hybrid" ? "mixed" : owner === "ai" ? "output_focused" : "standard";
        const estimatedUserMinutes = owner === "ai" ? 0 : owner === "human" ? minutes : null;
        await tx`
          insert into public.tasks(id,user_id,work_context_id,objective_id,title,description,execution_mode,
            estimated_minutes,estimated_user_minutes,importance,status,next_action,completion_criteria)
          values(${taskId},${decision.userId},${proposal.workContextId},${item.objectiveId},${item.title},${item.description},
            ${taskExecutionMode},${minutes},${estimatedUserMinutes},${priorityImportance[priority]},'INBOX',${item.title},
            ${item.acceptanceCriteria.join("\n")})
          on conflict(id) do nothing
        `;
        const steps = owner === "hybrid"
          ? [{ title: `초안 작성: ${item.title}`, owner: "ai" as const }, { title: `검토 및 확정: ${item.title}`, owner: "user" as const }]
          : [{ title: item.title, owner: owner === "human" ? "user" as const : "ai" as const }];
        for (const [index, step] of steps.entries()) {
          const stepId = stableUuid(`backlog-step:${decision.proposalArtifactId}:${item.key}:${index + 1}`);
          await tx`
            insert into public.task_steps(id,user_id,task_id,position,title,owner,estimated_minutes,completion_criteria,status,skill_key)
            values(${stepId},${decision.userId},${taskId},${index + 1},${step.title},${step.owner},
              ${steps.length === 1 ? minutes : null},${item.acceptanceCriteria.join("\n")},
              ${index === 0 && item.dependencies.length > 0 ? "dependency_waiting" : "pending"},
              ${step.owner === "ai" ? "document-draft" : null})
            on conflict(id) do nothing
          `;
          await tx`
            insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,
              correlation_id,workflow_run_id,causation_id,idempotency_key,payload_version,payload)
            select ${decision.userId},'task_step_created','task_step',${stepId},'user',${input.now},w.correlation_id,w.id,
              ${String(approval.checkpoint_state.requestEventId)},${`backlog-step-created:${decision.proposalArtifactId}:${item.key}:${index + 1}`},1,
              ${tx.json({ task_id: taskId, proposal_artifact_id: decision.proposalArtifactId, proposal_item_key: item.key, owner: step.owner })}
            from public.workflow_runs w where w.id=${approval.workflow_run_id} and w.user_id=${decision.userId}
            on conflict(user_id,idempotency_key) do nothing
          `;
        }
        await tx`
          insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,
            correlation_id,workflow_run_id,causation_id,idempotency_key,payload_version,payload)
          select ${decision.userId},'task_created','task',${taskId},'user',${input.now},w.correlation_id,w.id,
            ${String(approval.checkpoint_state.requestEventId)},
            ${`backlog-task-created:${decision.proposalArtifactId}:${item.key}`},1,
            ${tx.json({ previous_status: null, next_status: "INBOX", source: "backlog_approval", changed_at: input.now.toISOString(),
              proposal_artifact_id: decision.proposalArtifactId, proposal_item_key: item.key, decision_id: decisionId })}
          from public.workflow_runs w where w.id=${approval.workflow_run_id} and w.user_id=${decision.userId}
          on conflict(user_id,idempotency_key) do nothing
        `;
      }
      await tx`
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,
          correlation_id,workflow_run_id,causation_id,idempotency_key,payload_version,payload)
        select ${decision.userId},'decision_resolved','decision',${decisionId},'user',${input.now},w.correlation_id,w.id,
          ${String(approval.checkpoint_state.requestEventId)},${`backlog-decision-resolved:${decision.proposalArtifactId}`},1,
          ${tx.json({ proposal_artifact_id: decision.proposalArtifactId, accepted_item_keys: decision.acceptedItems.map((item) => item.proposalItemKey),
            excluded_item_keys: decision.excludedItems.map((item) => item.proposalItemKey) })}
        from public.workflow_runs w where w.id=${approval.workflow_run_id} and w.user_id=${decision.userId}
        on conflict(user_id,idempotency_key) do nothing
      `;
      const taskIds = decision.acceptedItems.map((item) => stableUuid(`backlog-task:${decision.proposalArtifactId}:${item.proposalItemKey}`));
      const dependenciesByItem = Object.fromEntries(decision.acceptedItems.map((selection) => {
        const item = proposal.items.find((candidate) => candidate.key === selection.proposalItemKey)!;
        return [item.key, item.dependencies];
      }));
      await tx`
        update public.approval_requests set decision_id=${decisionId},status='approved',responded_at=${input.now},responded_by='user',
          response_payload=${tx.json({ decisionHash, acceptedItems: decision.acceptedItems, excludedItems: decision.excludedItems })}
        where id=${approval.id} and user_id=${decision.userId}
      `;
      await tx`
        update public.workflow_runs set status='completed',current_step='ROUTED',checkpoint_version=checkpoint_version+1,
          checkpoint_state=checkpoint_state || ${tx.json({ approvalRequestId: approval.id, decisionId, decisionHash, taskIds,
            acceptedItemKeys: decision.acceptedItems.map((item) => item.proposalItemKey),
            dependenciesByItem,
            excludedItemKeys: decision.excludedItems.map((item) => item.proposalItemKey) })},updated_at=${input.now},completed_at=${input.now}
        where id=${approval.workflow_run_id} and user_id=${decision.userId}
      `;
      return false;
    });
    const result = await this.loadMaterializedResult(input.approval.userId, input.approval.workflowRunId);
    return { ...result, duplicate };
  }

  private async getApprovalByWorkflow(userId: UserId, workflowRunId: string): Promise<BacklogApprovalRecord | null> {
    const rows = await this.sql<ApprovalRow[]>`
      select a.id,a.user_id,a.workflow_run_id,a.action_ref,a.action_hash,a.checkpoint_version,a.status,w.checkpoint_state
      from public.approval_requests a join public.workflow_runs w on w.id=a.workflow_run_id and w.user_id=a.user_id
      where a.workflow_run_id=${workflowRunId} and a.user_id=${userId} and a.action_type=${ACTION_TYPE}
    `;
    return rows[0] ? this.mapApproval(rows[0]) : null;
  }

  private async mapApproval(row: ApprovalRow): Promise<BacklogApprovalRecord> {
    const proposalRows = await this.sql<{ content_text: string }[]>`
      select content_text from public.artifacts where id=${row.action_ref} and user_id=${row.user_id} and artifact_type='backlog_proposal'
    `;
    const snapshotId = String(row.checkpoint_state.sourceSnapshotArtifactId);
    const snapshotRows = await this.sql<{ content_text: string }[]>`
      select content_text from public.artifacts where id=${snapshotId} and user_id=${row.user_id} and artifact_type='project_state_snapshot'
    `;
    if (!proposalRows[0] || !snapshotRows[0]) throw new Error("Backlog approval source artifact is missing");
    return {
      id: row.id,
      userId: row.user_id as UserId,
      workflowRunId: row.workflow_run_id,
      workflowCheckpointVersion: row.checkpoint_version,
      workContextId: String(row.checkpoint_state.workContextId),
      proposalArtifactId: row.action_ref,
      proposalHash: row.action_hash,
      sourceSnapshotArtifactId: snapshotId,
      sourceSnapshotFingerprint: String(row.checkpoint_state.sourceSnapshotFingerprint),
      status: row.status,
      proposal: backlogProposalArtifactSchema.parse(JSON.parse(proposalRows[0].content_text)),
      sourceSnapshot: projectStateSnapshotSchema.parse(JSON.parse(snapshotRows[0].content_text))
    };
  }

  private async loadMaterializedResult(userId: UserId, workflowRunId: string): Promise<Omit<BacklogApprovalResult, "duplicate">> {
    const rows = await this.sql<{ id: string; checkpoint_state: Record<string, unknown> }[]>`
      select id,checkpoint_state from public.workflow_runs where id=${workflowRunId} and user_id=${userId} and workflow_type=${WORKFLOW_TYPE}
    `;
    const workflow = rows[0];
    if (!workflow || typeof workflow.checkpoint_state.decisionId !== "string") throw new Error("Materialized backlog result is missing");
    const taskIds = Array.isArray(workflow.checkpoint_state.taskIds)
      ? workflow.checkpoint_state.taskIds.filter((value): value is string => typeof value === "string") : [];
    const tasks = taskIds.length === 0 ? [] : await this.sql<{ id: string; title: string; importance: number }[]>`
      select id,title,importance from public.tasks where user_id=${userId} and id in ${this.sql(taskIds)} order by created_at,id
    `;
    const stepRows = taskIds.length === 0 ? [] : await this.sql<TaskStepRow[]>`
      select id,task_id,position,title,owner,status from public.task_steps where user_id=${userId} and task_id in ${this.sql(taskIds)}
      order by task_id,position
    `;
    const proposalId = String(workflow.checkpoint_state.proposalArtifactId);
    const acceptedItemKeys = Array.isArray(workflow.checkpoint_state.acceptedItemKeys)
      ? workflow.checkpoint_state.acceptedItemKeys.filter((value): value is string => typeof value === "string") : [];
    const dependenciesByItem = workflow.checkpoint_state.dependenciesByItem && typeof workflow.checkpoint_state.dependenciesByItem === "object"
      ? workflow.checkpoint_state.dependenciesByItem as Record<string, unknown> : {};
    const resultTasks: MaterializedTask[] = tasks.map((task) => {
      const steps = stepRows.filter((step) => step.task_id === task.id);
      const proposalItemKey = acceptedItemKeys.find((key) => stableUuid(`backlog-task:${proposalId}:${key}`) === task.id) ?? "unknown";
      const materializedSteps: MaterializedTaskStep[] = steps.map((step) => ({
        id: step.id, taskId: step.task_id, position: step.position, title: step.title, owner: step.owner, status: step.status,
        route: Array.isArray(dependenciesByItem[proposalItemKey]) && dependenciesByItem[proposalItemKey].length > 0
          ? "dependency_waiting"
          : routeStep({ position: step.position, owner: step.owner, status: step.status }, steps)
      }));
      return { id: task.id, proposalItemKey, title: task.title, importance: task.importance, steps: materializedSteps };
    });
    const excludedItemKeys = Array.isArray(workflow.checkpoint_state.excludedItemKeys)
      ? workflow.checkpoint_state.excludedItemKeys.filter((value): value is string => typeof value === "string") : [];
    return {
      approvalRequestId: String(workflow.checkpoint_state.approvalRequestId),
      workflowRunId: workflow.id,
      decisionId: String(workflow.checkpoint_state.decisionId),
      tasks: resultTasks,
      excludedItemKeys
    };
  }
}
