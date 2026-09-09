import { DomainError } from "@amber/shared";
import { getTaskEventType } from "../task/task-event.js";
import { assertTaskTransition } from "../task/task-state-machine.js";
const mapTarget = (userId, row) => ({
    userId, artifactId: row.artifact_id, contentHash: row.content_hash, contentText: row.content_text,
    verificationStatus: row.verification_status, reviewStatus: row.review_status, workContextId: row.work_context_id,
    taskId: row.task_id, taskStatus: row.task_status, taskExecutionMode: row.execution_mode,
    taskStepId: row.task_step_id, taskStepStatus: row.step_status, taskStepPosition: row.position,
    taskStepCompletionCriteria: row.completion_criteria, sourceAgentRunId: row.source_agent_run_id
});
export class SupabaseArtifactReviewRepository {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async loadTarget(userId, artifactId) {
        const rows = await this.sql `
      select a.id artifact_id,a.content_hash,a.content_text,a.verification_status,a.review_status,a.work_context_id,
        a.task_id,t.status task_status,t.execution_mode,a.task_step_id,s.status step_status,s.position,s.completion_criteria,a.source_agent_run_id
      from public.artifacts a join public.tasks t on t.id=a.task_id and t.user_id=a.user_id
      join public.task_steps s on s.id=a.task_step_id and s.user_id=a.user_id and s.task_id=t.id
      where a.id=${artifactId} and a.user_id=${userId} and a.artifact_type='document_draft'
        and a.content_text is not null and a.content_hash is not null and a.source_agent_run_id is not null
    `;
        return rows[0] ? mapTarget(userId, rows[0]) : null;
    }
    async recordReview(input) {
        const { command, now } = input;
        return this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${command.userId}:${command.idempotencyKey}`},0))`;
            const duplicate = await tx `
        select id,correlation_id,payload from public.domain_events where user_id=${command.userId} and idempotency_key=${command.idempotencyKey}
      `;
            if (duplicate[0]) {
                if (duplicate[0].payload.artifactId !== command.artifactId || duplicate[0].payload.decision !== command.decision) {
                    throw new DomainError("CONFLICT", "Review idempotency key is bound to another command");
                }
                return {
                    artifactId: command.artifactId, decisionId: String(duplicate[0].payload.decisionId), reviewEventId: duplicate[0].id,
                    correlationId: duplicate[0].correlation_id, decision: command.decision,
                    taskCompleted: duplicate[0].payload.taskCompleted === true, duplicate: true
                };
            }
            const rows = await tx `
        select a.id artifact_id,a.content_hash,a.content_text,a.verification_status,a.review_status,a.work_context_id,
          a.task_id,t.status task_status,t.execution_mode,a.task_step_id,s.status step_status,s.position,s.completion_criteria,a.source_agent_run_id
        from public.artifacts a join public.tasks t on t.id=a.task_id and t.user_id=a.user_id
        join public.task_steps s on s.id=a.task_step_id and s.user_id=a.user_id and s.task_id=t.id
        where a.id=${command.artifactId} and a.user_id=${command.userId} for update of a,t,s
      `;
            const current = rows[0];
            if (!current || current.work_context_id !== command.workContextId)
                throw new DomainError("CROSS_USER_ACCESS", "Artifact is outside the requested Project scope");
            if (current.content_hash !== command.artifactContentHash)
                throw new DomainError("CONFLICT", "Artifact content changed before review");
            if (current.review_status !== "pending_review")
                throw new DomainError("CONFLICT", "Artifact has already been reviewed");
            const runRows = await tx `
        select r.workflow_run_id,w.correlation_id from public.agent_runs r
        join public.workflow_runs w on w.id=r.workflow_run_id and w.user_id=r.user_id
        where r.id=${current.source_agent_run_id} and r.user_id=${command.userId}
      `;
            const run = runRows[0];
            if (!run)
                throw new DomainError("CONFLICT", "Artifact execution trace is incomplete");
            const decisions = await tx `
        insert into public.decisions(user_id,workflow_run_id,question,why_now,options,ai_recommendation,impact,status,created_at,resolved_at)
        values(${command.userId},${run.workflow_run_id},'AI 산출물을 채택할까?','artifact_result_review',
          ${tx.json({ choices: ["accept", "revise", "reject"] })},null,
          ${tx.json({ context: { projectId: command.workContextId, taskId: current.task_id, taskStepId: current.task_step_id, artifactId: current.artifact_id } })},
          'resolved',${now},${now}) returning id
      `;
            const decisionId = decisions[0].id;
            await tx `
        insert into public.decision_feedback(user_id,decision_id,user_choice,user_reason)
        values(${command.userId},${decisionId},${tx.json({ decision: command.decision, revisionInstruction: command.revisionInstruction ?? null })},${command.reason ?? null})
      `;
            await tx `update public.artifacts set review_status=${command.decision === "accept" ? "accepted" : "rejected"} where id=${current.artifact_id} and user_id=${command.userId}`;
            const completedStepIds = [];
            if (command.decision === "accept") {
                await tx `update public.task_steps set status='completed',updated_at=${now} where id=${current.task_step_id} and user_id=${command.userId}`;
                completedStepIds.push(current.task_step_id);
                if (current.execution_mode === "mixed") {
                    const reviewSteps = await tx `
            update public.task_steps set status='completed',updated_at=${now}
            where user_id=${command.userId} and task_id=${current.task_id} and review_of_step_id=${current.task_step_id}
              and owner='user' and status='pending' returning id
          `;
                    completedStepIds.push(...reviewSteps.map((item) => item.id));
                }
            }
            else {
                await tx `update public.task_steps set status=${command.decision === "revise" ? "pending" : "blocked"},updated_at=${now} where id=${current.task_step_id} and user_id=${command.userId}`;
            }
            const remaining = await tx `
        select count(*)::int count from public.task_steps where user_id=${command.userId} and task_id=${current.task_id} and status not in ('completed','skipped')
      `;
            const taskCompleted = command.decision === "accept" && remaining[0]?.count === 0;
            const previousStatus = current.task_status;
            const nextStatus = taskCompleted ? "DONE" : command.decision === "reject" ? "BLOCKED" : "IN_PROGRESS";
            if (previousStatus !== nextStatus) {
                assertTaskTransition(previousStatus, nextStatus);
                await tx `update public.tasks set status=${nextStatus},completed_at=${taskCompleted ? now : null},updated_at=${now} where id=${current.task_id} and user_id=${command.userId}`;
            }
            const causation = await tx `
        select id from public.domain_events where user_id=${command.userId} and aggregate_type='task'
          and aggregate_id=${current.task_id} and event_type='task_waiting_for_user' order by occurred_at desc limit 1
      `;
            const reviewEvents = await tx `
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,causation_id,
          workflow_run_id,idempotency_key,payload_version,payload)
        values(${command.userId},${command.decision === "accept" ? "artifact_accepted" : command.decision === "revise" ? "artifact_revision_requested" : "artifact_rejected"},'artifact',${current.artifact_id},'user',${now},${run.correlation_id},
          ${causation[0]?.id ?? null},${run.workflow_run_id},${command.idempotencyKey},1,
          ${tx.json({ artifactId: current.artifact_id, decision: command.decision, decisionId, taskId: current.task_id,
                taskStepId: current.task_step_id, completedStepIds, taskCompleted, reason: command.reason ?? null,
                revisionInstruction: command.revisionInstruction ?? null })}) returning id
      `;
            if (previousStatus !== nextStatus) {
                await tx `
          insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,causation_id,
            workflow_run_id,idempotency_key,payload_version,payload)
          values(${command.userId},${getTaskEventType(previousStatus, nextStatus)},'task',${current.task_id},'user',${now},${run.correlation_id},
            ${reviewEvents[0].id},${run.workflow_run_id},${`${command.idempotencyKey}:task`},1,
            ${tx.json({ previous_status: previousStatus, next_status: nextStatus, reason: command.reason ?? `artifact_${command.decision}`,
                    source: "artifact_review", changed_at: now.toISOString() })})
        `;
            }
            return {
                artifactId: current.artifact_id, decisionId, reviewEventId: reviewEvents[0].id,
                correlationId: run.correlation_id, decision: command.decision, taskCompleted, duplicate: false
            };
        });
    }
}
//# sourceMappingURL=supabase-artifact-review-repository.js.map