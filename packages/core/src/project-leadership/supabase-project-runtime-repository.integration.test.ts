import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseProjectPmRepository } from "../project-pm/supabase-project-pm-repository.js";
import { deriveProjectRuntimeSummary } from "./project-runtime.js";
import { SupabaseProjectRuntimeRepository } from "./supabase-project-runtime-repository.js";
import { contentHash } from "./project-state-projector.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID() as UserId;
const scopeId = randomUUID();
const projectId = randomUUID();
const objectiveId = randomUUID();
const taskId = randomUUID();
const stepId = randomUUID();
const leadershipRunId = randomUUID();
const approvalRunId = randomUUID();
const snapshotId = randomUUID();
const gapId = randomUUID();
const proposalId = randomUUID();
const reviewId = randomUUID();
const now = new Date("2026-09-13T01:00:00.000Z");

const snapshot = {
  schemaVersion: "1", workContextId: projectId, generatedAt: now.toISOString(),
  project: { id: projectId, title: "Runtime Project", description: null, status: "active", startDate: null, endDate: null },
  primaryObjectiveId: objectiveId,
  objectives: [{ id: objectiveId, goalId: null, title: "출시", targetDate: null, successCriteria: "출시됨", importance: 5, status: "active" }],
  goals: [], tasks: [], artifacts: [], decisions: [], recentEvents: [],
  sourceRefs: [{ ref: `work_context:${projectId}`, kind: "work_context", freshness: "current", observedAt: now.toISOString(), contentHash: null }],
  blockers: [], unresolved: []
};
const gap = {
  schemaVersion: "1", workContextId: projectId, objectiveId, sourceSnapshotArtifactId: snapshotId,
  sourceRefs: [`work_context:${projectId}`], generatedAt: now.toISOString(), unknowns: [],
  gaps: [{ key: "gap", title: "출시 기준", description: "출시 기준을 정해야 함", evidenceRefs: [`work_context:${projectId}`],
    priorityHint: "high", confidence: .9, blocking: true, rationale: "현재 기준 없음" }]
};
const proposal = {
  schemaVersion: "1", workContextId: projectId, objectiveId, sourceSnapshotArtifactId: snapshotId,
  sourceGapAnalysisArtifactId: gapId, sourceRefs: ["gap:gap"], generatedAt: now.toISOString(), unknowns: [],
  items: [{ key: "draft", sourceGapKey: "gap", objectiveId, title: "기준 초안", description: "기준 초안 작성",
    suggestedPriority: "high", suggestedOwner: "ai", acceptanceCriteria: ["초안 존재"], dependencies: [], roughSize: "s",
    evidenceRefs: ["gap:gap"], risk: null }]
};

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values(${userId},${`project-runtime-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul')`;
  await sql`insert into public.scopes(id,user_id,kind,label) values(${scopeId},${userId},'work_context','Runtime Project')`;
  await sql`insert into public.work_contexts(id,user_id,scope_id,kind,title,status,agent_mode) values(${projectId},${userId},${scopeId},'project','Runtime Project','active','auto')`;
  await sql`insert into public.objectives(id,user_id,scope_id,work_context_id,title,importance,status,origin) values(${objectiveId},${userId},${scopeId},${projectId},'출시',5,'active','user')`;
  await sql`insert into public.tasks(id,user_id,work_context_id,objective_id,title,execution_mode,importance,status) values(${taskId},${userId},${projectId},${objectiveId},'기준 초안','output_focused',4,'INBOX')`;
  await sql`insert into public.task_steps(id,user_id,task_id,position,title,owner,status,skill_key) values(${stepId},${userId},${taskId},1,'기준 초안', 'ai','pending','document-draft')`;
  await sql`insert into public.artifacts(id,user_id,artifact_type,title,work_context_id,content_text,content_hash) values
    (${snapshotId},${userId},'project_state_snapshot','snapshot',${projectId},${JSON.stringify(snapshot)},${contentHash(snapshot)}),
    (${gapId},${userId},'gap_analysis','gap',${projectId},${JSON.stringify(gap)},${contentHash(gap)}),
    (${proposalId},${userId},'backlog_proposal','proposal',${projectId},${JSON.stringify(proposal)},${contentHash(proposal)})`;
  await sql`insert into public.workflow_runs(id,user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at,updated_at,completed_at)
    values(${leadershipRunId},${userId},'project_leadership_iteration','completed','COMPLETE',${sql.json({ workContextId: projectId, snapshotArtifactId: snapshotId, gapAnalysisArtifactId: gapId, backlogProposalArtifactId: proposalId })},3,'runtime-test',${randomUUID()},${now},${now},${now})`;
  await sql`insert into public.workflow_runs(id,user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at,updated_at)
    values(${approvalRunId},${userId},'backlog_approval_materialization','waiting_for_user','AWAITING_APPROVAL',${sql.json({ workContextId: projectId })},1,'runtime-approval-test',${randomUUID()},${now},${now})`;
  await sql`insert into public.approval_requests(user_id,workflow_run_id,action_type,action_ref,action_hash,checkpoint_version,status,requested_at,resume_idempotency_key)
    values(${userId},${approvalRunId},'materialize_backlog_proposal',${proposalId},${contentHash(proposal)},1,'pending',${now},'runtime-approval-resume-test')`;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("Supabase Project runtime read model", () => {
  it("derives pending approval and verified review states from durable Project rows", async () => {
    const project = (await new SupabaseProjectPmRepository(sql).listProjects(userId))[0]!;
    const repository = new SupabaseProjectRuntimeRepository(sql);
    const approval = deriveProjectRuntimeSummary(await repository.loadFacts(userId, project));
    expect(approval).toMatchObject({
      project: { id: projectId, title: "Runtime Project" },
      iterationState: "approval_required", currentGap: { title: "출시 기준" },
      proposal: { id: proposalId, items: [{ key: "draft", owner: "ai" }] }
    });

    await sql`update public.approval_requests set status='approved' where user_id=${userId} and action_ref=${proposalId}`;
    await sql`insert into public.artifacts(id,user_id,artifact_type,title,task_id,task_step_id,work_context_id,schema_version,verification_status,review_status,content_text,content_hash,source_refs)
      values(${reviewId},${userId},'document_draft','검토 초안',${taskId},${stepId},${projectId},'1','verified','pending_review','{}','review-hash','[]')`;
    const review = deriveProjectRuntimeSummary(await repository.loadFacts(userId, project));
    expect(review).toMatchObject({ iterationState: "review_required", pendingReviewCount: 1, nextAction: "review_artifact" });
  });
});
