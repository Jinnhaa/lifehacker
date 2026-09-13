import { FixedClock, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import type { ProjectPmContext, ProjectPmRepository, ProjectWorkContext } from "../project-pm/project-pm.js";
import type { BacklogApprovalResult } from "./backlog-approval.js";
import type { ProjectLeadershipRunResult } from "./project-leadership.js";
import { ProjectRuntimeService } from "./project-runtime-service.js";
import { deriveProjectRuntimeSummary, type ProjectRuntimeFacts, type ProjectRuntimeRepository } from "./project-runtime.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const projectId = "20000000-0000-4000-8000-000000000001";
const objectiveId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-13T01:00:00.000Z");
const project: ProjectWorkContext = {
  id: projectId, userId, scopeId: "40000000-0000-4000-8000-000000000001",
  title: "LogFolio", description: null, status: "active", startDate: null, endDate: null
};
const proposal = {
  id: "50000000-0000-4000-8000-000000000001",
  contentHash: "a".repeat(64),
  content: {
    schemaVersion: "1", workContextId: projectId, objectiveId,
    sourceSnapshotArtifactId: "60000000-0000-4000-8000-000000000001",
    sourceGapAnalysisArtifactId: "70000000-0000-4000-8000-000000000001",
    sourceRefs: ["gap:gap-1"], generatedAt: now.toISOString(), unknowns: [],
    items: [{ key: "draft", sourceGapKey: "gap-1", objectiveId, title: "기획 초안", description: "초안을 작성한다",
      suggestedPriority: "high", suggestedOwner: "ai", acceptanceCriteria: ["초안 존재"], dependencies: [], roughSize: "s",
      evidenceRefs: ["gap:gap-1"], risk: null }]
  }
} as const;

const facts = (overrides: Partial<ProjectRuntimeFacts> = {}): ProjectRuntimeFacts => ({
  project, iteration: null, approval: null, openSteps: [], runningAgentRunCount: 0,
  pendingReviewArtifacts: [], waitingForUserCount: 0, ...overrides
});

const completedIteration = {
  id: "80000000-0000-4000-8000-000000000001", status: "completed" as const, currentStep: "COMPLETE",
  snapshot: { id: proposal.content.sourceSnapshotArtifactId, content: { generatedAt: now.toISOString() } as never },
  gapAnalysis: { id: proposal.content.sourceGapAnalysisArtifactId, content: { gaps: [{ title: "완료 기준 부족", description: "기준 확인 필요", blocking: true }] } as never },
  backlogProposal: proposal as never
};

const context: ProjectPmContext = {
  userId, project, observedAt: now, planDate: "2026-09-13", timeZone: "Asia/Seoul",
  objectives: [{ id: objectiveId, title: "출시", goalId: null, targetDate: null, successCriteria: "출시됨", importance: 5, status: "active" }],
  goals: [], tasks: [], taskSteps: [], artifacts: [], decisions: [], sourceReferences: [], activeFocus: null,
  approvedPlanTasks: [], recentEvents: []
};

const setup = (initial: ProjectRuntimeFacts) => {
  let current = initial;
  const projectRepository: ProjectPmRepository = {
    listProjects: vi.fn(async () => [project]),
    loadProjectContext: vi.fn(async () => context)
  };
  const runtimeRepository: ProjectRuntimeRepository = { loadFacts: vi.fn(async () => current) };
  const leadershipService = { run: vi.fn(async () => {
    current = facts({ iteration: completedIteration });
    return { workflowRunId: completedIteration.id, snapshot: completedIteration.snapshot,
      gapAnalysis: completedIteration.gapAnalysis, backlogProposal: completedIteration.backlogProposal } as unknown as ProjectLeadershipRunResult;
  }) };
  const approvalService = {
    requestApproval: vi.fn(async () => {
      current = facts({ iteration: completedIteration, approval: { id: "90000000-0000-4000-8000-000000000001", status: "pending" } });
      return current.approval!;
    }),
    decide: vi.fn(async (): Promise<BacklogApprovalResult> => ({
      approvalRequestId: "90000000-0000-4000-8000-000000000001", workflowRunId: "workflow", decisionId: "decision",
      tasks: [{ id: "task", proposalItemKey: "draft", title: "기획 초안", importance: 4,
        steps: [{ id: "step-ai", taskId: "task", position: 1, title: "기획 초안", owner: "ai" as const, status: "pending", route: "ai_executable" as const }] }],
      excludedItemKeys: [], duplicate: false
    }))
  };
  const executionService = { dispatch: vi.fn(async () => ({ status: "waiting_for_review" as const, agentRunId: "run", artifactId: "artifact", attemptNumber: 1 })) };
  return {
    service: new ProjectRuntimeService({ projectRepository, runtimeRepository, leadershipService, approvalService, executionService, clock: new FixedClock(now) }),
    leadershipService, approvalService, executionService, setFacts: (value: ProjectRuntimeFacts) => { current = value; }
  };
};

describe("Project runtime entry", () => {
  it("lists registered Projects and starts the first iteration through the existing leadership and approval services", async () => {
    const subject = setup(facts());
    await expect(subject.service.list(userId)).resolves.toEqual([expect.objectContaining({ project: expect.objectContaining({ id: projectId }), nextAction: "start_iteration" })]);
    const result = await subject.service.startOrContinue({ userId, workContextId: projectId, timeZone: "Asia/Seoul" });
    expect(subject.leadershipService.run).toHaveBeenCalledOnce();
    expect(subject.leadershipService.run).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: expect.stringMatching(/^project-runtime:/) }));
    expect(subject.approvalService.requestApproval).toHaveBeenCalledWith(expect.objectContaining({ proposalArtifactId: proposal.id }));
    expect(result.summary.nextAction).toBe("review_proposal");
    await subject.service.startOrContinue({ userId, workContextId: projectId, timeZone: "Asia/Seoul" });
    expect(subject.leadershipService.run).toHaveBeenCalledOnce();
    expect(subject.approvalService.requestApproval).toHaveBeenCalledOnce();
  });

  it("returns an existing pending proposal without creating another iteration", async () => {
    const subject = setup(facts({ iteration: completedIteration, approval: { id: "90000000-0000-4000-8000-000000000001", status: "pending" } }));
    const result = await subject.service.startOrContinue({ userId, workContextId: projectId, timeZone: "Asia/Seoul" });
    expect(result.summary.nextAction).toBe("review_proposal");
    expect(subject.leadershipService.run).not.toHaveBeenCalled();
    expect(subject.approvalService.requestApproval).not.toHaveBeenCalled();
  });

  it("starts the next idempotent analysis after the current materialized work is complete", async () => {
    const subject = setup(facts({ iteration: completedIteration, approval: { id: "90000000-0000-4000-8000-000000000001", status: "approved" } }));
    const before = await subject.service.list(userId);
    expect(before[0]?.nextActionLabel).toBe("다음 단계 분석");
    await subject.service.startOrContinue({ userId, workContextId: projectId, timeZone: "Asia/Seoul" });
    expect(subject.leadershipService.run).toHaveBeenCalledOnce();
    expect(subject.approvalService.requestApproval).toHaveBeenCalledOnce();
  });

  it("routes only materialized AI-owned executable steps after approval", async () => {
    const subject = setup(facts({ iteration: completedIteration, approval: { id: "90000000-0000-4000-8000-000000000001", status: "pending" } }));
    await subject.service.decideBacklog({ userId, workContextId: projectId, timeZone: "Asia/Seoul", acceptedItemKeys: ["draft"] });
    expect(subject.approvalService.decide).toHaveBeenCalledWith(expect.objectContaining({ acceptedItems: [{ proposalItemKey: "draft" }] }), "Asia/Seoul");
    expect(subject.executionService.dispatch).toHaveBeenCalledWith({ userId, taskStepId: "step-ai", timeZone: "Asia/Seoul" });
  });

  it("rejects the visible proposal by excluding every item without materializing AI work", async () => {
    const subject = setup(facts({ iteration: completedIteration, approval: { id: "90000000-0000-4000-8000-000000000001", status: "pending" } }));
    subject.approvalService.decide.mockResolvedValueOnce({
      approvalRequestId: "90000000-0000-4000-8000-000000000001", workflowRunId: "workflow", decisionId: "decision",
      tasks: [], excludedItemKeys: ["draft"], duplicate: false
    });
    await subject.service.decideBacklog({ userId, workContextId: projectId, timeZone: "Asia/Seoul", acceptedItemKeys: [], userReason: "거절" });
    expect(subject.approvalService.decide).toHaveBeenCalledWith(expect.objectContaining({
      acceptedItems: [], excludedItems: [{ proposalItemKey: "draft" }]
    }), "Asia/Seoul");
    expect(subject.executionService.dispatch).not.toHaveBeenCalled();
  });

  it("derives guard states without dispatching human, blocked, running, or review work", async () => {
    expect(deriveProjectRuntimeSummary(facts({ iteration: completedIteration, openSteps: [
      { id: "human", title: "확인", owner: "user", status: "pending", dependenciesResolved: true },
      { id: "blocked", title: "대기", owner: "ai", status: "dependency_waiting", dependenciesResolved: false }
    ], approval: { id: "approval", status: "approved" } })).nextAction).toBe("complete_human_work");
    expect(deriveProjectRuntimeSummary(facts({ iteration: completedIteration, runningAgentRunCount: 1,
      approval: { id: "approval", status: "approved" } })).nextAction).toBe("wait_for_ai");
    expect(deriveProjectRuntimeSummary(facts({ iteration: completedIteration,
      pendingReviewArtifacts: [{ id: "artifact", title: "초안" }], approval: { id: "approval", status: "approved" } })).nextAction).toBe("review_artifact");
  });

  it("keeps an AI step with unresolved dependencies out of Current runtime execution", async () => {
    const subject = setup(facts({ iteration: completedIteration, approval: { id: "approval", status: "approved" }, openSteps: [
      { id: "blocked", title: "대기", owner: "ai", status: "dependency_waiting", dependenciesResolved: false }
    ] }));
    const result = await subject.service.startOrContinue({ userId, workContextId: projectId, timeZone: "Asia/Seoul" });
    expect(result.summary.iterationState).toBe("blocked");
    expect(subject.executionService.dispatch).not.toHaveBeenCalled();
    expect(subject.leadershipService.run).not.toHaveBeenCalled();
  });
});
