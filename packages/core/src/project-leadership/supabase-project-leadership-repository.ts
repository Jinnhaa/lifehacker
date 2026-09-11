import type { UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import {
  backlogProposalArtifactSchema,
  gapAnalysisArtifactSchema,
  PROJECT_LEADERSHIP_POLICY_VERSION,
  PROJECT_LEADERSHIP_WORKFLOW_TYPE,
  projectStateSnapshotSchema,
  type BacklogProposalArtifact,
  type GapAnalysisArtifact,
  type ProjectLeadershipArtifactRecord,
  type ProjectLeadershipRepository,
  type ProjectLeadershipWorkflowState,
  type ProjectStateSnapshot
} from "./project-leadership.js";
import { contentHash, stableJson } from "./project-state-projector.js";

interface WorkflowRow {
  id: string;
  status: "running" | "completed" | "failed";
  current_step: ProjectLeadershipWorkflowState["currentStep"];
  checkpoint_version: number;
  checkpoint_state: Record<string, unknown>;
}

interface ArtifactRow { id: string; artifact_type: string; content_text: string; content_hash: string }

const json = (value: unknown): JSONValue => value as JSONValue;

export class SupabaseProjectLeadershipRepository implements ProjectLeadershipRepository {
  constructor(private readonly sql: Sql) {}

  async getOrCreateWorkflow(input: Parameters<ProjectLeadershipRepository["getOrCreateWorkflow"]>[0]): Promise<ProjectLeadershipWorkflowState> {
    const runId = await this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.idempotencyKey}`},0))`;
      const existing = await tx<{ id: string }[]>`
        select id from public.workflow_runs where user_id=${input.userId} and idempotency_key=${input.idempotencyKey}
      `;
      if (existing[0]) return existing[0].id;
      const runs = await tx<{ id: string }[]>`
        insert into public.workflow_runs(
          user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at,updated_at
        ) values(
          ${input.userId},${PROJECT_LEADERSHIP_WORKFLOW_TYPE},'running','OBSERVE',
          ${tx.json({ workContextId: input.workContextId, causedByEventId: input.causationId ?? null })},0,${input.idempotencyKey},
          coalesce(${input.correlationId ?? null}::uuid,gen_random_uuid()),${input.now},${input.now}
        ) returning id
      `;
      const packages = await tx<{ id: string }[]>`
        insert into public.context_packages(user_id,scope_id,work_context_id,payload,source_refs,policy_version)
        values(${input.userId},${input.scopeId},${input.workContextId},${tx.json(json(input.contextPayload))},
          ${tx.json({ refs: input.sourceRefs, contextHash: contentHash(input.contextPayload) })},${PROJECT_LEADERSHIP_POLICY_VERSION}) returning id
      `;
      await tx`
        update public.workflow_runs set checkpoint_state=checkpoint_state || ${tx.json({ contextPackageId: packages[0]!.id })}
        where id=${runs[0]!.id} and user_id=${input.userId}
      `;
      return runs[0]!.id;
    });
    return this.loadState(input.userId, runId);
  }

  saveSnapshot(userId: UserId, run: ProjectLeadershipWorkflowState, content: ProjectStateSnapshot, now: Date): Promise<ProjectLeadershipWorkflowState> {
    return this.saveArtifact(userId, run, "OBSERVE", "DETECT_GAPS", "project_state_snapshot", content, now, false);
  }

  saveGapAnalysis(userId: UserId, run: ProjectLeadershipWorkflowState, content: GapAnalysisArtifact, now: Date): Promise<ProjectLeadershipWorkflowState> {
    return this.saveArtifact(userId, run, "DETECT_GAPS", "PROPOSE_BACKLOG", "gap_analysis", content, now, false);
  }

  saveBacklogProposal(userId: UserId, run: ProjectLeadershipWorkflowState, content: BacklogProposalArtifact, now: Date): Promise<ProjectLeadershipWorkflowState> {
    return this.saveArtifact(userId, run, "PROPOSE_BACKLOG", "COMPLETE", "backlog_proposal", content, now, true);
  }

  private async saveArtifact<T>(
    userId: UserId,
    run: ProjectLeadershipWorkflowState,
    expectedStep: ProjectLeadershipWorkflowState["currentStep"],
    nextStep: ProjectLeadershipWorkflowState["currentStep"],
    artifactType: ProjectLeadershipArtifactRecord<unknown>["artifactType"],
    content: T,
    now: Date,
    complete: boolean
  ): Promise<ProjectLeadershipWorkflowState> {
    await this.sql.begin(async (tx) => {
      const rows = await tx<WorkflowRow[]>`
        select id,status,current_step,checkpoint_version,checkpoint_state from public.workflow_runs
        where id=${run.id} and user_id=${userId} for update
      `;
      const current = rows[0];
      if (!current) throw new Error("Project leadership workflow not found");
      if (current.checkpoint_version !== run.checkpointVersion || current.current_step !== expectedStep) {
        if (current.checkpoint_version > run.checkpointVersion) return;
        throw new Error("Project leadership workflow checkpoint conflict");
      }
      const artifacts = await tx<{ id: string }[]>`
        insert into public.artifacts(user_id,artifact_type,title,work_context_id,content_text,content_hash)
        values(${userId},${artifactType},${artifactType},${String(current.checkpoint_state.workContextId)},${stableJson(content)},${contentHash(content)})
        returning id
      `;
      const checkpointKey = artifactType === "project_state_snapshot" ? "snapshotArtifactId"
        : artifactType === "gap_analysis" ? "gapAnalysisArtifactId" : "backlogProposalArtifactId";
      await tx`
        update public.workflow_runs set status=${complete ? "completed" : "running"},current_step=${nextStep},
          checkpoint_state=checkpoint_state || ${tx.json({ [checkpointKey]: artifacts[0]!.id })},
          checkpoint_version=checkpoint_version+1,updated_at=${now},completed_at=${complete ? now : null}
        where id=${run.id} and user_id=${userId}
      `;
    });
    return this.loadState(userId, run.id);
  }

  private async loadState(userId: UserId, workflowRunId: string): Promise<ProjectLeadershipWorkflowState> {
    const rows = await this.sql<WorkflowRow[]>`
      select id,status,current_step,checkpoint_version,checkpoint_state from public.workflow_runs
      where id=${workflowRunId} and user_id=${userId} and workflow_type=${PROJECT_LEADERSHIP_WORKFLOW_TYPE}
    `;
    const row = rows[0];
    if (!row) throw new Error("Project leadership workflow not found");
    const readArtifact = async <T>(key: string, schema: { parse(value: unknown): T }): Promise<ProjectLeadershipArtifactRecord<T> | undefined> => {
      const id = row.checkpoint_state[key];
      if (typeof id !== "string") return undefined;
      const artifacts = await this.sql<ArtifactRow[]>`
        select id,artifact_type,content_text,content_hash from public.artifacts where id=${id} and user_id=${userId}
      `;
      const artifact = artifacts[0];
      if (!artifact) throw new Error(`Workflow artifact is missing: ${key}`);
      return {
        id: artifact.id,
        artifactType: artifact.artifact_type as ProjectLeadershipArtifactRecord<T>["artifactType"],
        contentHash: artifact.content_hash,
        content: schema.parse(JSON.parse(artifact.content_text))
      };
    };
    const [snapshot, gapAnalysis, backlogProposal] = await Promise.all([
      readArtifact("snapshotArtifactId", projectStateSnapshotSchema),
      readArtifact("gapAnalysisArtifactId", gapAnalysisArtifactSchema),
      readArtifact("backlogProposalArtifactId", backlogProposalArtifactSchema)
    ]);
    return {
      id: row.id,
      status: row.status,
      currentStep: row.current_step,
      checkpointVersion: row.checkpoint_version,
      ...(snapshot ? { snapshot } : {}),
      ...(gapAnalysis ? { gapAnalysis } : {}),
      ...(backlogProposal ? { backlogProposal } : {})
    };
  }
}
