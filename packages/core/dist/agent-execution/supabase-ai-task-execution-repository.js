import { createHash } from "node:crypto";
import { AgentBootstrapService } from "./agent-bootstrap.js";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class SupabaseAiTaskExecutionRepository {
    sql;
    bootstrap;
    constructor(sql) {
        this.sql = sql;
        this.bootstrap = new AgentBootstrapService(sql);
    }
    async loadTarget(userId, taskStepId) {
        const rows = await this.sql `
      select s.id task_step_id,s.task_id,coalesce(t.work_context_id,o.work_context_id) work_context_id,w.scope_id,
        s.owner,s.status,t.status task_status,s.skill_key
      from public.task_steps s join public.tasks t on t.id=s.task_id and t.user_id=s.user_id
      left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
      left join public.work_contexts w on w.id=coalesce(t.work_context_id,o.work_context_id) and w.user_id=t.user_id
      where s.id=${taskStepId} and s.user_id=${userId}
    `;
        const row = rows[0];
        if (!row?.work_context_id || !row.scope_id)
            return null;
        return {
            userId, taskStepId: row.task_step_id, taskId: row.task_id, workContextId: row.work_context_id,
            scopeId: row.scope_id, owner: row.owner, status: row.status, taskStatus: row.task_status, skillKey: row.skill_key
        };
    }
    async findSuccessful(userId, executionKey) {
        const rows = await this.sql `
      select r.id agent_run_id,a.id artifact_id from public.agent_runs r
      join public.artifacts a on a.source_agent_run_id=r.id and a.user_id=r.user_id
      where r.user_id=${userId} and r.execution_key=${executionKey} and r.status='completed'
        and a.verification_status='verified' order by r.attempt_number limit 1
    `;
        return rows[0] ? { agentRunId: rows[0].agent_run_id, artifactId: rows[0].artifact_id } : null;
    }
    async startAttempt(input) {
        const instance = await this.bootstrap.ensureAgentInstance(input.target.userId, "project_pm", input.target.scopeId);
        if (!instance || instance.homeScopeId !== input.target.scopeId) {
            await this.blockWithoutAttempt({ target: input.target, code: "PERMISSION_DENIED", reason: "Project-scoped AgentInstance is unavailable", now: input.now });
            return { kind: "exhausted" };
        }
        return this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${input.target.userId}:${input.executionKey}`},0))`;
            const completed = await tx `
        select r.id agent_run_id,a.id artifact_id from public.agent_runs r
        join public.artifacts a on a.source_agent_run_id=r.id and a.user_id=r.user_id
        where r.user_id=${input.target.userId} and r.execution_key=${input.executionKey} and r.status='completed'
          and a.verification_status='verified' limit 1
      `;
            if (completed[0])
                return { kind: "reused", agentRunId: completed[0].agent_run_id, artifactId: completed[0].artifact_id };
            const running = await tx `
        select id from public.agent_runs where user_id=${input.target.userId} and execution_key=${input.executionKey} and status='running' limit 1
      `;
            if (running[0])
                return { kind: "busy", agentRunId: running[0].id };
            const counts = await tx `
        select count(*)::int attempts from public.agent_runs where user_id=${input.target.userId} and execution_key=${input.executionKey}
      `;
            const attemptNumber = (counts[0]?.attempts ?? 0) + 1;
            if (attemptNumber > input.maxAttempts) {
                await tx `update public.task_steps set status='blocked',updated_at=${input.now} where id=${input.target.taskStepId} and user_id=${input.target.userId}`;
                await tx `update public.tasks set status='BLOCKED',updated_at=${input.now} where id=${input.target.taskId} and user_id=${input.target.userId} and status='IN_PROGRESS'`;
                return { kind: "exhausted" };
            }
            const workflows = await tx `
        insert into public.workflow_runs(user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at,updated_at)
        values(${input.target.userId},'ai_task_execution','running','EXECUTING',
          ${tx.json({ taskStepId: input.target.taskStepId, executionKey: input.executionKey, contextHash: input.contextHash })},0,
          ${`ai-task-execution:${input.executionKey}`},gen_random_uuid(),${input.now},${input.now})
        on conflict(user_id,idempotency_key) do update set updated_at=excluded.updated_at
        returning id,correlation_id
      `;
            const workflow = workflows[0];
            const packages = await tx `
        insert into public.context_packages(user_id,scope_id,task_id,task_step_id,work_context_id,payload,source_refs,policy_version)
        values(${input.target.userId},${input.target.scopeId},${input.target.taskId},${input.target.taskStepId},${input.target.workContextId},
          ${tx.json(input.contextPayload)},${tx.json({ refs: input.sourceRefs, contextHash: input.contextHash })},'ai-task-read-only-v1') returning id
      `;
            const runs = await tx `
        insert into public.agent_runs(user_id,agent_instance_id,workflow_run_id,context_package_id,task_step_id,template_version,policy_version,
          skill_key,skill_version,attempt_number,execution_key,idempotency_key,status,max_turns,max_tool_calls,started_at)
        values(${input.target.userId},${instance.id},${workflow.id},${packages[0].id},${input.target.taskStepId},${instance.templateVersion},
          'ai-task-read-only-v1',${input.skillKey},${input.skillVersion},${attemptNumber},${input.executionKey},
          ${`${input.executionKey}:${attemptNumber}`},'running',1,0,${input.now}) returning id
      `;
            const previousTask = await tx `
        select status from public.tasks where id=${input.target.taskId} and user_id=${input.target.userId} for update
      `;
            if (previousTask[0] && ["INBOX", "PLANNED"].includes(previousTask[0].status)) {
                await tx `update public.tasks set status='IN_PROGRESS',updated_at=${input.now} where id=${input.target.taskId} and user_id=${input.target.userId}`;
                await tx `
          insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
          values(${input.target.userId},'task_started','task',${input.target.taskId},'agent',${input.now},${workflow.correlation_id},${workflow.id},
            ${`ai-task-started:${input.executionKey}`},1,${tx.json({ previous_status: previousTask[0].status, next_status: "IN_PROGRESS", source: "ai_task_execution", changed_at: input.now.toISOString() })})
          on conflict(user_id,idempotency_key) do nothing
        `;
            }
            await tx `update public.task_steps set status='in_progress',updated_at=${input.now} where id=${input.target.taskStepId} and user_id=${input.target.userId}`;
            return { kind: "started", workflowRunId: workflow.id, agentRunId: runs[0].id, contextPackageId: packages[0].id, attemptNumber };
        });
    }
    async completeAttempt(input) {
        return this.sql.begin(async (tx) => {
            const updated = await tx `
        update public.agent_runs set status='completed',ended_at=${input.now} where id=${input.attempt.agentRunId}
          and user_id=${input.target.userId} and status='running' returning id
      `;
            if (!updated[0]) {
                const existing = await tx `select id from public.artifacts where user_id=${input.target.userId} and source_agent_run_id=${input.attempt.agentRunId}`;
                if (!existing[0])
                    throw new Error("AgentRun completion lost its Artifact");
                return existing[0].id;
            }
            const content = { schemaVersion: "1", skillKey: "document-draft", taskStepId: input.target.taskStepId, ...input.result };
            const artifacts = await tx `
        insert into public.artifacts(user_id,artifact_type,title,task_id,task_step_id,work_context_id,source_ai_execution_id,
          source_agent_run_id,revision_of_artifact_id,schema_version,verification_status,review_status,content_text,content_hash,source_refs)
        values(${input.target.userId},'document_draft',${input.result.title},${input.target.taskId},${input.target.taskStepId},${input.target.workContextId},
          (select id from public.ai_executions where user_id=${input.target.userId} and agent_run_id=${input.attempt.agentRunId} and status='completed' order by completed_at desc limit 1),
          ${input.attempt.agentRunId},${input.revisionOfArtifactId ?? null},'1','verified','pending_review',${JSON.stringify(content)},${hash(content)},${tx.json(input.sourceRefs)}) returning id
      `;
            await tx `update public.task_steps set status='waiting_for_review',updated_at=${input.now} where id=${input.target.taskStepId} and user_id=${input.target.userId}`;
            await tx `update public.tasks set status='WAITING_FOR_USER',updated_at=${input.now} where id=${input.target.taskId} and user_id=${input.target.userId} and status='IN_PROGRESS'`;
            await tx `update public.workflow_runs set status='completed',current_step='AWAITING_REVIEW',checkpoint_state=checkpoint_state || ${tx.json({ artifactId: artifacts[0].id })},updated_at=${input.now},completed_at=${input.now} where id=${input.attempt.workflowRunId} and user_id=${input.target.userId}`;
            await tx `
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
        select ${input.target.userId},'task_waiting_for_user','task',${input.target.taskId},'agent',${input.now},correlation_id,id,
          ${`ai-task-awaiting-review:${input.executionKey}`},1,${tx.json({ previous_status: "IN_PROGRESS", next_status: "WAITING_FOR_USER", source: "ai_task_execution", changed_at: input.now.toISOString(), artifact_id: artifacts[0].id })}
        from public.workflow_runs where id=${input.attempt.workflowRunId} and user_id=${input.target.userId}
        on conflict(user_id,idempotency_key) do nothing
      `;
            return artifacts[0].id;
        });
    }
    async failAttempt(input) {
        await this.sql.begin(async (tx) => {
            await tx `update public.agent_runs set status='failed',failure_code=${input.code},failure_reason=${input.reason},ended_at=${input.now} where id=${input.attempt.agentRunId} and user_id=${input.target.userId} and status='running'`;
            if (input.terminal) {
                await tx `update public.task_steps set status='blocked',updated_at=${input.now} where id=${input.target.taskStepId} and user_id=${input.target.userId}`;
                await tx `update public.tasks set status='BLOCKED',updated_at=${input.now} where id=${input.target.taskId} and user_id=${input.target.userId} and status='IN_PROGRESS'`;
                await tx `update public.workflow_runs set status='failed',current_step='BLOCKED',updated_at=${input.now},completed_at=${input.now} where id=${input.attempt.workflowRunId} and user_id=${input.target.userId}`;
            }
            else {
                await tx `update public.task_steps set status='pending',updated_at=${input.now} where id=${input.target.taskStepId} and user_id=${input.target.userId}`;
                await tx `update public.workflow_runs set current_step='RETRY_PENDING',updated_at=${input.now} where id=${input.attempt.workflowRunId} and user_id=${input.target.userId}`;
            }
        });
    }
    async blockWithoutAttempt(input) {
        await this.sql.begin(async (tx) => {
            await tx `update public.task_steps set status='blocked',updated_at=${input.now} where id=${input.target.taskStepId} and user_id=${input.target.userId}`;
            await tx `update public.tasks set status='BLOCKED',updated_at=${input.now} where id=${input.target.taskId} and user_id=${input.target.userId} and status in ('IN_PROGRESS','PLANNED')`;
            await tx `
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
        values(${input.target.userId},'ai_task_execution_blocked','task_step',${input.target.taskStepId},'system',${input.now},gen_random_uuid(),
          ${`ai-task-blocked:${input.target.taskStepId}:${input.code}`},1,${tx.json({ code: input.code, reason: input.reason })})
        on conflict(user_id,idempotency_key) do nothing
      `;
        });
    }
}
//# sourceMappingURL=supabase-ai-task-execution-repository.js.map