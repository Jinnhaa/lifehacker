import { DomainError, FixedClock, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import type { AiTaskExecutionResult } from "../agent-execution/ai-task-execution.js";
import type { ProjectLeadershipRunResult } from "../project-leadership/project-leadership.js";
import type { ArtifactReviewCommand, ArtifactReviewRecord, ArtifactReviewRepository, ArtifactReviewTarget } from "./artifact-review.js";
import { ArtifactReviewService } from "./artifact-review-service.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const artifactId = "20000000-0000-4000-8000-000000000001";
const projectId = "30000000-0000-4000-8000-000000000001";
const taskId = "40000000-0000-4000-8000-000000000001";
const stepId = "50000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const now = new Date("2026-09-10T01:00:00.000Z");

const target = (overrides: Partial<ArtifactReviewTarget> = {}): ArtifactReviewTarget => ({
  userId, artifactId, contentHash: hash,
  contentText: JSON.stringify({ schemaVersion: "1", skillKey: "document-draft", taskStepId: stepId,
    title: "Draft", summary: "Summary", body: "Body", addressedCriteria: ["done"], sourceRefs: [`task_step:${stepId}`], uncertainties: [] }),
  verificationStatus: "verified", reviewStatus: "pending_review", workContextId: projectId, taskId,
  taskStatus: "WAITING_FOR_USER", taskExecutionMode: "mixed", taskStepId: stepId,
  taskStepStatus: "waiting_for_review", taskStepPosition: 1, taskStepCompletionCriteria: "done",
  sourceAgentRunId: "60000000-0000-4000-8000-000000000001", ...overrides
});

const command = (decision: "accept" | "revise" | "reject", overrides: Record<string, unknown> = {}) => ({
  userId, workContextId: projectId, artifactId, artifactContentHash: hash, decision,
  idempotencyKey: `review-${decision}`, ...(decision === "revise" ? { revisionInstruction: "Add evidence" } : {}), ...overrides
});

const iteration = {
  workflowRunId: "70000000-0000-4000-8000-000000000001",
  snapshot: { id: "71000000-0000-4000-8000-000000000001", artifactType: "project_state_snapshot", contentHash: hash, content: { tasks: [{ id: taskId, status: "DONE" }] } },
  gapAnalysis: { id: "72000000-0000-4000-8000-000000000001", artifactType: "gap_analysis", contentHash: hash, content: { gaps: [], unknowns: [] } },
  backlogProposal: { id: "73000000-0000-4000-8000-000000000001", artifactType: "backlog_proposal", contentHash: hash, content: { items: [], unknowns: [] } }
} as unknown as ProjectLeadershipRunResult;

const setup = (targetValue = target(), duplicate = false) => {
  const records: ArtifactReviewRecord[] = [];
  const repository: ArtifactReviewRepository = {
    loadTarget: vi.fn(async () => targetValue),
    recordReview: vi.fn(async ({ command: reviewCommand }) => {
      const record: ArtifactReviewRecord = {
        artifactId, decisionId: "80000000-0000-4000-8000-000000000001",
        reviewEventId: "81000000-0000-4000-8000-000000000001", correlationId: "82000000-0000-4000-8000-000000000001",
        decision: reviewCommand.decision, taskCompleted: reviewCommand.decision === "accept", duplicate
      };
      records.push(record); return record;
    })
  };
  const revision: AiTaskExecutionResult = { status: "waiting_for_review", agentRunId: "90000000-0000-4000-8000-000000000001", artifactId: "91000000-0000-4000-8000-000000000001", attemptNumber: 1 };
  const aiExecutionService = { dispatch: vi.fn(async () => revision) };
  const projectLeadershipService = { run: vi.fn(async () => iteration) };
  return { service: new ArtifactReviewService({ repository, aiExecutionService, projectLeadershipService, clock: new FixedClock(now) }), repository, aiExecutionService, projectLeadershipService, records };
};

describe("Artifact review closed loop", () => {
  it("accepts a verified pending Artifact, completes execution state, and starts the next project iteration", async () => {
    const subject = setup();
    const result = await subject.service.review(command("accept"), "Asia/Seoul");
    expect(result).toMatchObject({ decision: "accept", taskCompleted: true, nextIteration: { workflowRunId: iteration.workflowRunId } });
    expect(subject.projectLeadershipService.run).toHaveBeenCalledWith(expect.objectContaining({
      workContextId: projectId, idempotencyKey: `project-feedback:${artifactId}:${hash}`
    }));
  });

  it("rejects without completing the Task or projecting rejected content", async () => {
    const subject = setup();
    const result = await subject.service.review(command("reject", { reason: "Not useful" }), "Asia/Seoul");
    expect(result).toMatchObject({ decision: "reject", taskCompleted: false });
    expect(subject.projectLeadershipService.run).not.toHaveBeenCalled();
    expect(subject.aiExecutionService.dispatch).not.toHaveBeenCalled();
  });

  it("keeps the original content immutable and dispatches a linked revision execution", async () => {
    const original = target();
    const subject = setup(original);
    const result = await subject.service.review(command("revise", { reason: "Needs sources" }), "Asia/Seoul");
    expect(result).toMatchObject({ decision: "revise", revisionExecution: { status: "waiting_for_review" } });
    expect(original.contentHash).toBe(hash);
    expect(subject.aiExecutionService.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      taskStepId: stepId,
      revisionRequest: expect.objectContaining({ revisionOfArtifactId: artifactId, instruction: "Add evidence" })
    }));
    expect(subject.projectLeadershipService.run).not.toHaveBeenCalled();
  });

  it("rejects stale hash, cross-project review, and missing revision instructions", async () => {
    const subject = setup();
    await expect(subject.service.review(command("accept", { artifactContentHash: "b".repeat(64) }), "Asia/Seoul")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(subject.service.review(command("accept", { workContextId: "30000000-0000-4000-8000-000000000099" }), "Asia/Seoul")).rejects.toMatchObject({ code: "CROSS_USER_ACCESS" });
    await expect(subject.service.review(command("revise", { revisionInstruction: undefined }), "Asia/Seoul")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("does not accept an Artifact that no longer satisfies TaskStep completion criteria", async () => {
    const subject = setup(target({ taskStepCompletionCriteria: "missing" }));
    await expect(subject.service.review(command("accept"), "Asia/Seoul")).rejects.toBeInstanceOf(DomainError);
    expect(subject.repository.recordReview).not.toHaveBeenCalled();
  });

  it("returns the recomputed snapshot, gap analysis, and next backlog proposal", async () => {
    const result = await setup().service.review(command("accept"), "Asia/Seoul");
    expect(result.nextIteration?.snapshot.content.tasks).toEqual([{ id: taskId, status: "DONE" }]);
    expect(result.nextIteration?.gapAnalysis.content.gaps).toEqual([]);
    expect(result.nextIteration?.backlogProposal.content.items).toEqual([]);
  });

  it("reuses an idempotently recorded review and the same next-iteration identity", async () => {
    const subject = setup(target({ reviewStatus: "accepted" }), true);
    const result = await subject.service.review(command("accept"), "Asia/Seoul");
    expect(result.duplicate).toBe(true);
    expect(subject.projectLeadershipService.run).toHaveBeenCalledOnce();
    expect(subject.projectLeadershipService.run).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `project-feedback:${artifactId}:${hash}` }));
  });
});
