import { randomUUID } from "node:crypto";
import {
  AiTaskExecutionService,
  ArtifactReviewService,
  BacklogApprovalService,
  ProjectLeadershipService,
  SupabaseAiTaskExecutionRepository,
  SupabaseArtifactReviewRepository,
  SupabaseBacklogApprovalRepository,
  SupabaseProjectLeadershipRepository,
  SupabaseProjectPmRepository
} from "@amber/core";
import { SystemClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpenAIAiTaskExecutor } from "./openai-ai-task-executor.js";
import { OpenAIProjectAnalysisProvider } from "./openai-project-analysis-provider.js";
import { SupabaseAIExecutionRecorder } from "./supabase-ai-execution-recorder.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const clock = new SystemClock();
const userId = randomUUID() as UserId;
const scopeId = randomUUID();
const projectId = randomUUID();
const objectiveId = randomUUID();

beforeAll(async () => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for the P0 validation");
  await sql`insert into auth.users(id,email,created_at,updated_at) values(${userId},${`p0-closed-loop-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul')`;
  await sql`insert into public.scopes(id,user_id,kind,label) values(${scopeId},${userId},'work_context','P0 validation project')`;
  await sql`
    insert into public.work_contexts(id,user_id,scope_id,kind,title,description,status,agent_mode)
    values(${projectId},${userId},${scopeId},'project','P0 Closed Loop Validation',
      'Project Leadership와 AI execution closed loop의 실제 검증 프로젝트','active','auto')
  `;
  await sql`
    insert into public.objectives(id,user_id,scope_id,work_context_id,title,success_criteria,importance,status,origin)
    values(${objectiveId},${userId},${scopeId},${projectId},'검토된 실행 기준 문서 확보',
      '연결 Task가 DONE이고, 실행 기준을 설명하는 verified document Artifact가 사용자에게 accepted되면 완료 가능하다.',5,'active','user')
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("P0 Project Leadership + AI Execution closed loop", () => {
  it("validates Wave 1→4, revise→v2→accept, and the Objective completion guard", async () => {
    const projectRepository = new SupabaseProjectPmRepository(sql);
    const executionRecorder = new SupabaseAIExecutionRecorder(sql);
    const analysisProvider = OpenAIProjectAnalysisProvider.fromEnvironment(process.env, { executionRecorder, clock });
    const leadership = new ProjectLeadershipService({
      projectRepository,
      workflowRepository: new SupabaseProjectLeadershipRepository(sql),
      analysisProvider,
      clock
    });
    const constraints = [
      "이 validation에서는 현재 Objective를 향한 실행 가능한 gap을 식별한다.",
      "backlog가 필요하면 dependency가 없는 document-draft item을 최소 개수로 제안한다.",
      "accepted Artifact와 DONE Task가 Objective success criteria를 충족하면 완료 가능성을 objective-completion-confirmation blocking gap으로 표현하고 사용자 확인 없이 Objective를 완료하지 않는다."
    ];

    const initial = await leadership.run({
      userId, workContextId: projectId, timeZone: "Asia/Seoul", constraints,
      idempotencyKey: `p0-initial-${projectId}`
    });
    expect(initial.snapshot.content.workContextId).toBe(projectId);
    expect(initial.gapAnalysis.content.gaps.length).toBeGreaterThan(0);
    expect(initial.backlogProposal.content.items.length).toBeGreaterThan(0);
    const proposalItem = initial.backlogProposal.content.items.find((item) => item.dependencies.length === 0);
    expect(proposalItem, "OpenAI must propose one dependency-free item for this minimal validation").toBeDefined();

    const approvalService = new BacklogApprovalService({
      repository: new SupabaseBacklogApprovalRepository(sql), projectRepository, clock
    });
    const approval = await approvalService.requestApproval({
      userId, proposalArtifactId: initial.backlogProposal.id, proposalHash: initial.backlogProposal.contentHash,
      idempotencyKey: `p0-approval-${initial.backlogProposal.id}`
    });
    const selected = proposalItem!;
    const materialized = await approvalService.decide({
      userId, approvalRequestId: approval.id, proposalArtifactId: initial.backlogProposal.id,
      proposalHash: initial.backlogProposal.contentHash,
      acceptedItems: [{ proposalItemKey: selected.key, ownerOverride: "ai" }],
      excludedItems: initial.backlogProposal.content.items.filter((item) => item.key !== selected.key)
        .map((item) => ({ proposalItemKey: item.key, reason: "최소 비용 P0 validation 범위" })),
      userReason: "실제 AI execution closed loop를 최소 비용으로 검증한다."
    }, "Asia/Seoul");
    const task = materialized.tasks.find((item) => item.proposalItemKey === selected.key)!;
    const aiStep = task.steps.find((step) => step.owner === "ai")!;
    expect(aiStep.route).toBe("ai_executable");

    const aiExecution = new AiTaskExecutionService({
      repository: new SupabaseAiTaskExecutionRepository(sql), projectRepository,
      executor: OpenAIAiTaskExecutor.fromEnvironment(process.env, { executionRecorder, clock }), clock
    });
    const v1Execution = await aiExecution.dispatch({ userId, taskStepId: aiStep.id, timeZone: "Asia/Seoul" });
    if (v1Execution.status !== "waiting_for_review") {
      const failures = await sql<{ attempt_number: number; failure_code: string | null; failure_reason: string | null }[]>`
        select attempt_number,failure_code,failure_reason from public.agent_runs
        where user_id=${userId} and task_step_id=${aiStep.id} order by attempt_number
      `;
      throw new Error(`v1 Artifact was not produced: ${JSON.stringify({ executionStatus: v1Execution.status, failures })}`);
    }
    const v1Rows = await sql<{ id: string; content_text: string; content_hash: string; review_status: string; source_agent_run_id: string }[]>`
      select id,content_text,content_hash,review_status,source_agent_run_id from public.artifacts where id=${v1Execution.artifactId}
    `;
    const v1 = v1Rows[0]!;
    expect(v1.review_status).toBe("pending_review");
    const immutableV1 = { contentText: v1.content_text, contentHash: v1.content_hash };

    const review = new ArtifactReviewService({
      repository: new SupabaseArtifactReviewRepository(sql), aiExecutionService: aiExecution,
      projectLeadershipService: leadership, clock
    });
    const reviseCommand = {
      userId, workContextId: projectId, artifactId: v1.id, artifactContentHash: v1.content_hash,
      decision: "revise" as const, reason: "Objective 완료 근거를 더 명확히 연결해야 한다.",
      revisionInstruction: "Objective success criteria와 TaskStep completion criteria를 각각 명시하고, 현재 ContextPackage 근거만 사용해 문서를 보강한다.",
      idempotencyKey: `p0-revise-${v1.id}`
    };
    const revised = await review.review(reviseCommand, "Asia/Seoul", constraints);
    expect(revised.revisionExecution?.status).toBe("waiting_for_review");
    if (revised.revisionExecution?.status !== "waiting_for_review") throw new Error("v2 Artifact was not produced");
    const v2Id = revised.revisionExecution.artifactId;
    const [afterRevisionV1, v2Rows, agentRunsBeforeReplay] = await Promise.all([
      sql<{ content_text: string; content_hash: string; review_status: string }[]>`select content_text,content_hash,review_status from public.artifacts where id=${v1.id}`,
      sql<{ id: string; review_status: string; verification_status: string; revision_of_artifact_id: string; source_agent_run_id: string; content_hash: string }[]>`
        select id,review_status,verification_status,revision_of_artifact_id,source_agent_run_id,content_hash from public.artifacts where id=${v2Id}`,
      sql<{ count: number }[]>`select count(*)::int count from public.agent_runs where user_id=${userId} and task_step_id=${aiStep.id}`
    ]);
    const v2 = v2Rows[0]!;
    expect(afterRevisionV1[0]).toEqual({
      content_text: immutableV1.contentText,
      content_hash: immutableV1.contentHash,
      review_status: "rejected"
    });
    expect(v2).toMatchObject({ review_status: "pending_review", verification_status: "verified", revision_of_artifact_id: v1.id });
    expect(v2.source_agent_run_id).not.toBe(v1.source_agent_run_id);

    const replayRevision = await review.review(reviseCommand, "Asia/Seoul", constraints);
    expect(replayRevision.duplicate).toBe(true);
    expect(replayRevision.revisionExecution).toMatchObject({ status: "reused", artifactId: v2.id });
    const agentRunsAfterReplay = await sql<{ count: number }[]>`select count(*)::int count from public.agent_runs where user_id=${userId} and task_step_id=${aiStep.id}`;
    expect(agentRunsAfterReplay[0]?.count).toBe(agentRunsBeforeReplay[0]?.count);

    const acceptCommand = {
      userId, workContextId: projectId, artifactId: v2.id, artifactContentHash: v2.content_hash,
      decision: "accept" as const, reason: "Objective 완료 판단에 사용할 수 있는 근거가 충분하다.",
      idempotencyKey: `p0-accept-${v2.id}`
    };
    const accepted = await review.review(acceptCommand, "Asia/Seoul", constraints);
    expect(accepted.taskCompleted).toBe(true);
    expect(accepted.nextIteration).toBeDefined();
    const projectedArtifacts = accepted.nextIteration!.snapshot.content.artifacts;
    const evidenceIds = projectedArtifacts.map((item) => item.id);
    expect(evidenceIds).toContain(v2.id);
    expect(evidenceIds).not.toContain(v1.id);
    expect(projectedArtifacts.find((item) => item.id === v2.id)).toMatchObject({
      verificationStatus: "verified", reviewStatus: "accepted"
    });
    expect(accepted.nextIteration!.gapAnalysis.content.gaps.length).toBeGreaterThan(0);
    expect(accepted.nextIteration!.backlogProposal.content.items).toBeDefined();

    const countsBeforeAcceptReplay = await sql<{ decisions: number; workflows: number; artifacts: number }[]>`
      select
        (select count(*)::int from public.decisions where user_id=${userId}) decisions,
        (select count(*)::int from public.workflow_runs where user_id=${userId}) workflows,
        (select count(*)::int from public.artifacts where user_id=${userId}) artifacts
    `;
    const replayAccept = await review.review(acceptCommand, "Asia/Seoul", constraints);
    const countsAfterAcceptReplay = await sql<{ decisions: number; workflows: number; artifacts: number }[]>`
      select
        (select count(*)::int from public.decisions where user_id=${userId}) decisions,
        (select count(*)::int from public.workflow_runs where user_id=${userId}) workflows,
        (select count(*)::int from public.artifacts where user_id=${userId}) artifacts
    `;
    expect(replayAccept.duplicate).toBe(true);
    expect(countsAfterAcceptReplay[0]).toEqual(countsBeforeAcceptReplay[0]);

    const [objectiveRows, taskRows, stepRows, finalArtifacts, completionEvents, aiExecutions] = await Promise.all([
      sql<{ status: string }[]>`select status from public.objectives where id=${objectiveId} and user_id=${userId}`,
      sql<{ status: string }[]>`select status from public.tasks where id=${task.id} and user_id=${userId}`,
      sql<{ status: string }[]>`select status from public.task_steps where task_id=${task.id} and user_id=${userId} order by position`,
      sql<{ id: string; review_status: string; revision_of_artifact_id: string | null }[]>`
        select id,review_status,revision_of_artifact_id from public.artifacts where id in (${v1.id},${v2.id}) order by created_at
      `,
      sql<{ count: number }[]>`select count(*)::int count from public.domain_events where user_id=${userId} and aggregate_id=${objectiveId} and event_type in ('objective_completed','objective_achieved')`,
      sql<{ count: number }[]>`select count(*)::int count from public.ai_executions where user_id=${userId} and status='completed'`
    ]);
    expect(objectiveRows[0]?.status).toBe("active");
    expect(completionEvents[0]?.count).toBe(0);
    expect(taskRows[0]?.status).toBe("DONE");
    expect(stepRows.every((step) => step.status === "completed")).toBe(true);
    expect(finalArtifacts).toEqual([
      { id: v1.id, review_status: "rejected", revision_of_artifact_id: null },
      { id: v2.id, review_status: "accepted", revision_of_artifact_id: v1.id }
    ]);

    console.log(JSON.stringify({
      projectId, objectiveStatus: objectiveRows[0]?.status, taskStatus: taskRows[0]?.status,
      initialGapCount: initial.gapAnalysis.content.gaps.length,
      nextBlockingGapCount: accepted.nextIteration!.gapAnalysis.content.gaps.filter((gap) => gap.blocking).length,
      v1: { id: v1.id, status: "rejected", contentHash: immutableV1.contentHash },
      v2: { id: v2.id, status: "accepted", revisionOf: v1.id },
      agentRunCount: agentRunsAfterReplay[0]?.count, completedAIExecutionCount: aiExecutions[0]?.count,
      idempotentReplay: countsAfterAcceptReplay[0]
    }));
  }, 240_000);
});
