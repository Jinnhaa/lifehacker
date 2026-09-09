import { backlogProposalArtifactSchema, gapAnalysisArtifactSchema, PROJECT_LEADERSHIP_POLICY_VERSION, PROJECT_LEADERSHIP_WORKFLOW_TYPE, projectStateSnapshotSchema } from "./project-leadership.js";
import { contentHash, stableJson } from "./project-state-projector.js";
const json = (value) => value;
export class SupabaseProjectLeadershipRepository {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async getOrCreateWorkflow(input) {
        const runId = await this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.idempotencyKey}`},0))`;
            const existing = await tx `
        select id from public.workflow_runs where user_id=${input.userId} and idempotency_key=${input.idempotencyKey}
      `;
            if (existing[0])
                return existing[0].id;
            const runs = await tx `
        insert into public.workflow_runs(
          user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at,updated_at
        ) values(
          ${input.userId},${PROJECT_LEADERSHIP_WORKFLOW_TYPE},'running','OBSERVE',
          ${tx.json({ workContextId: input.workContextId })},0,${input.idempotencyKey},gen_random_uuid(),${input.now},${input.now}
        ) returning id
      `;
            const packages = await tx `
        insert into public.context_packages(user_id,scope_id,work_context_id,payload,source_refs,policy_version)
        values(${input.userId},${input.scopeId},${input.workContextId},${tx.json(json(input.contextPayload))},
          ${tx.json({ refs: input.sourceRefs, contextHash: contentHash(input.contextPayload) })},${PROJECT_LEADERSHIP_POLICY_VERSION}) returning id
      `;
            await tx `
        update public.workflow_runs set checkpoint_state=checkpoint_state || ${tx.json({ contextPackageId: packages[0].id })}
        where id=${runs[0].id} and user_id=${input.userId}
      `;
            return runs[0].id;
        });
        return this.loadState(input.userId, runId);
    }
    saveSnapshot(userId, run, content, now) {
        return this.saveArtifact(userId, run, "OBSERVE", "DETECT_GAPS", "project_state_snapshot", content, now, false);
    }
    saveGapAnalysis(userId, run, content, now) {
        return this.saveArtifact(userId, run, "DETECT_GAPS", "PROPOSE_BACKLOG", "gap_analysis", content, now, false);
    }
    saveBacklogProposal(userId, run, content, now) {
        return this.saveArtifact(userId, run, "PROPOSE_BACKLOG", "COMPLETE", "backlog_proposal", content, now, true);
    }
    async saveArtifact(userId, run, expectedStep, nextStep, artifactType, content, now, complete) {
        await this.sql.begin(async (tx) => {
            const rows = await tx `
        select id,status,current_step,checkpoint_version,checkpoint_state from public.workflow_runs
        where id=${run.id} and user_id=${userId} for update
      `;
            const current = rows[0];
            if (!current)
                throw new Error("Project leadership workflow not found");
            if (current.checkpoint_version !== run.checkpointVersion || current.current_step !== expectedStep) {
                if (current.checkpoint_version > run.checkpointVersion)
                    return;
                throw new Error("Project leadership workflow checkpoint conflict");
            }
            const artifacts = await tx `
        insert into public.artifacts(user_id,artifact_type,title,work_context_id,content_text,content_hash)
        values(${userId},${artifactType},${artifactType},${String(current.checkpoint_state.workContextId)},${stableJson(content)},${contentHash(content)})
        returning id
      `;
            const checkpointKey = artifactType === "project_state_snapshot" ? "snapshotArtifactId"
                : artifactType === "gap_analysis" ? "gapAnalysisArtifactId" : "backlogProposalArtifactId";
            await tx `
        update public.workflow_runs set status=${complete ? "completed" : "running"},current_step=${nextStep},
          checkpoint_state=checkpoint_state || ${tx.json({ [checkpointKey]: artifacts[0].id })},
          checkpoint_version=checkpoint_version+1,updated_at=${now},completed_at=${complete ? now : null}
        where id=${run.id} and user_id=${userId}
      `;
        });
        return this.loadState(userId, run.id);
    }
    async loadState(userId, workflowRunId) {
        const rows = await this.sql `
      select id,status,current_step,checkpoint_version,checkpoint_state from public.workflow_runs
      where id=${workflowRunId} and user_id=${userId} and workflow_type=${PROJECT_LEADERSHIP_WORKFLOW_TYPE}
    `;
        const row = rows[0];
        if (!row)
            throw new Error("Project leadership workflow not found");
        const readArtifact = async (key, schema) => {
            const id = row.checkpoint_state[key];
            if (typeof id !== "string")
                return undefined;
            const artifacts = await this.sql `
        select id,artifact_type,content_text,content_hash from public.artifacts where id=${id} and user_id=${userId}
      `;
            const artifact = artifacts[0];
            if (!artifact)
                throw new Error(`Workflow artifact is missing: ${key}`);
            return {
                id: artifact.id,
                artifactType: artifact.artifact_type,
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
//# sourceMappingURL=supabase-project-leadership-repository.js.map