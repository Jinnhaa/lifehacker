import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseArtifactReviewRepository } from "./supabase-artifact-review-repository.js";
const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID();
const scopeId = randomUUID();
const projectId = randomUUID();
const taskId = randomUUID();
const aiStepId = randomUUID();
const reviewStepId = randomUUID();
const workflowId = randomUUID();
const templateId = randomUUID();
const instanceId = randomUUID();
const agentRunId = randomUUID();
const artifactId = randomUUID();
const correlationId = randomUUID();
const contentHash = "c".repeat(64);
const repository = new SupabaseArtifactReviewRepository(sql);
beforeAll(async () => {
    await sql `insert into auth.users(id,email,created_at,updated_at) values(${userId},${`artifact-review-${userId}@example.test`},now(),now())`;
    await sql `insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul')`;
    await sql `insert into public.scopes(id,user_id,kind,label) values(${scopeId},${userId},'work_context','Review Project')`;
    await sql `insert into public.work_contexts(id,user_id,scope_id,kind,title,status,agent_mode) values(${projectId},${userId},${scopeId},'project','Review Project','active','auto')`;
    await sql `insert into public.tasks(id,user_id,work_context_id,title,execution_mode,importance,status) values(${taskId},${userId},${projectId},'Draft task','mixed',4,'WAITING_FOR_USER')`;
    await sql `
    insert into public.task_steps(id,user_id,task_id,position,title,owner,completion_criteria,status,skill_key,review_of_step_id) values
      (${aiStepId},${userId},${taskId},1,'Draft','ai','done','waiting_for_review','document-draft',null),
      (${reviewStepId},${userId},${taskId},2,'Review','user','done','pending',null,${aiStepId})
  `;
    await sql `insert into public.workflow_runs(id,user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at) values(${workflowId},${userId},'ai_task_execution','completed','AWAITING_REVIEW','{}',1,${`execution-${workflowId}`},${correlationId},now())`;
    await sql `insert into public.agent_templates(id,user_id,template_key,version,name,role,instructions,active) values(${templateId},${userId},'project_pm','test-v1','PM','project_pm','test',true)`;
    await sql `insert into public.agent_instances(id,user_id,agent_template_id,template_version,name,home_scope_id,status) values(${instanceId},${userId},${templateId},'test-v1','PM',${scopeId},'active')`;
    await sql `insert into public.agent_runs(id,user_id,agent_instance_id,workflow_run_id,task_step_id,template_version,policy_version,skill_key,skill_version,attempt_number,execution_key,idempotency_key,status,max_turns,max_tool_calls,started_at,ended_at) values(${agentRunId},${userId},${instanceId},${workflowId},${aiStepId},'test-v1','test','document-draft','1',1,${`key-${agentRunId}`},${`run-${agentRunId}`},'completed',1,0,now(),now())`;
    const content = { schemaVersion: "1", skillKey: "document-draft", taskStepId: aiStepId, title: "Draft", summary: "Summary", body: "Body", addressedCriteria: ["done"], sourceRefs: [`task_step:${aiStepId}`], uncertainties: [] };
    await sql `insert into public.artifacts(id,user_id,artifact_type,title,task_id,task_step_id,work_context_id,source_agent_run_id,schema_version,verification_status,review_status,content_text,content_hash,source_refs) values(${artifactId},${userId},'document_draft','Draft',${taskId},${aiStepId},${projectId},${agentRunId},'1','verified','pending_review',${JSON.stringify(content)},${contentHash},'[]')`;
});
afterAll(async () => { await sql `delete from auth.users where id=${userId}`; await sql.end(); });
describe("SupabaseArtifactReviewRepository", () => {
    it("atomically accepts the Artifact, completes linked steps and Task, records Why, and deduplicates replay", async () => {
        const target = await repository.loadTarget(userId, artifactId);
        expect(target).not.toBeNull();
        const command = {
            userId, workContextId: projectId, artifactId, artifactContentHash: contentHash, decision: "accept",
            reason: "Meets the criteria", idempotencyKey: `artifact-review-${artifactId}`
        };
        const first = await repository.recordReview({ command, target: target, now: new Date("2026-09-10T02:00:00.000Z") });
        const replay = await repository.recordReview({ command, target: target, now: new Date("2026-09-10T02:01:00.000Z") });
        expect(first).toMatchObject({ taskCompleted: true, duplicate: false });
        expect(replay).toMatchObject({ decisionId: first.decisionId, reviewEventId: first.reviewEventId, duplicate: true });
        const [artifacts, tasks, steps, feedback] = await Promise.all([
            sql `select review_status from public.artifacts where id=${artifactId}`,
            sql `select status from public.tasks where id=${taskId}`,
            sql `select status from public.task_steps where task_id=${taskId} order by position`,
            sql `select f.user_reason from public.decision_feedback f join public.decisions d on d.id=f.decision_id where d.id=${first.decisionId}`
        ]);
        expect(artifacts[0]?.review_status).toBe("accepted");
        expect(tasks[0]?.status).toBe("DONE");
        expect(steps.map((item) => item.status)).toEqual(["completed", "completed"]);
        expect(feedback[0]?.user_reason).toBe("Meets the criteria");
    });
});
//# sourceMappingURL=supabase-artifact-review-repository.integration.test.js.map