import { FixedClock, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import type { ProjectPmContext, ProjectPmRepository, ProjectWorkContext } from "../project-pm/project-pm.js";
import type { Task } from "../task/task.js";
import {
  type BacklogProposalArtifact,
  type GapAnalysisArtifact,
  type ProjectLeadershipAnalysisProvider,
  type ProjectLeadershipRepository,
  type ProjectLeadershipWorkflowState,
  type ProjectStateSnapshot
} from "./project-leadership.js";
import { ProjectLeadershipService } from "./project-leadership-service.js";
import { contentHash, projectProjectState } from "./project-state-projector.js";

const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const now = new Date("2026-09-09T03:00:00.000Z");
const project: ProjectWorkContext = {
  id: "project-1", userId, scopeId: "scope-1", title: "LogFolio", description: "개발 로그",
  status: "active", startDate: "2026-09-01", endDate: null
};
const task = (id: string, status: Task["status"]): Task => ({
  id: id as Task["id"], userId, workContextId: project.id, objectiveId: "objective-1", title: id,
  description: null, executionMode: "standard", officialDeadline: null, internalDeadline: null,
  estimatedMinutes: 30, estimatedUserMinutes: 30, actualMinutes: 0, importance: 3, status,
  nextAction: null, completionCriteria: null, completionSource: null, createdAt: now, completedAt: null, updatedAt: now
});
const context = (): ProjectPmContext => ({
  userId, project, observedAt: now, planDate: "2026-09-09", timeZone: "Asia/Seoul",
  objectives: [{ id: "objective-1", title: "출시", goalId: "goal-1", targetDate: "2026-09-20", successCriteria: "핵심 흐름 검증", importance: 5, status: "active" }],
  goals: [{ id: "goal-1", title: "포트폴리오", status: "active" }],
  tasks: [task("task-open", "PLANNED"), task("task-blocked", "BLOCKED")],
  taskSteps: [{ id: "step-1", taskId: "task-open", position: 1, title: "검증", owner: "user", estimatedMinutes: 20, completionCriteria: "통과", status: "pending", skillKey: null }],
  artifacts: [{ id: "artifact-source", artifactType: "spec", title: "명세", taskId: "task-open", workContextId: project.id, contentText: "초안", contentHash: "source-hash", verificationStatus: null, reviewStatus: null, createdAt: now }],
  decisions: [{ id: "decision-1", question: "범위", whyNow: "출시", status: "resolved", createdAt: now, resolvedAt: now }],
  sourceReferences: [{ id: "external-1", source: "github", externalType: "repository", externalId: "logfolio", externalVersion: null, internalEntityType: "work_context", internalEntityId: project.id, syncStatus: "active", contentHash: null, lastSeenAt: now }],
  activeFocus: null, approvedPlanTasks: [],
  recentEvents: [{ id: "event-1", eventType: "task_blocked", aggregateType: "task", aggregateId: "task-blocked", occurredAt: now, payload: { reason: "missing criteria" } }]
});

class MemoryWorkflowRepository implements ProjectLeadershipRepository {
  state: ProjectLeadershipWorkflowState = { id: "workflow-1", status: "running", currentStep: "OBSERVE", checkpointVersion: 0 };
  async getOrCreateWorkflow(): Promise<ProjectLeadershipWorkflowState> { return this.state; }
  async saveSnapshot(_userId: UserId, _run: ProjectLeadershipWorkflowState, content: ProjectStateSnapshot): Promise<ProjectLeadershipWorkflowState> {
    this.state = { ...this.state, currentStep: "DETECT_GAPS", checkpointVersion: 1,
      snapshot: { id: "snapshot-1", artifactType: "project_state_snapshot", contentHash: contentHash(content), content } };
    return this.state;
  }
  async saveGapAnalysis(_userId: UserId, _run: ProjectLeadershipWorkflowState, content: GapAnalysisArtifact): Promise<ProjectLeadershipWorkflowState> {
    this.state = { ...this.state, currentStep: "PROPOSE_BACKLOG", checkpointVersion: 2,
      gapAnalysis: { id: "gap-1", artifactType: "gap_analysis", contentHash: contentHash(content), content } };
    return this.state;
  }
  async saveBacklogProposal(_userId: UserId, _run: ProjectLeadershipWorkflowState, content: BacklogProposalArtifact): Promise<ProjectLeadershipWorkflowState> {
    this.state = { ...this.state, status: "completed", currentStep: "COMPLETE", checkpointVersion: 3,
      backlogProposal: { id: "proposal-1", artifactType: "backlog_proposal", contentHash: contentHash(content), content } };
    return this.state;
  }
}

const provider = (overrides: Partial<ProjectLeadershipAnalysisProvider> = {}): ProjectLeadershipAnalysisProvider => ({
  reviewProjectState: vi.fn(async () => ({
    gaps: [{ key: "missing-ac", title: "완료 기준 부족", description: "검증 기준이 부족함", evidenceRefs: ["artifact:artifact-source"], priorityHint: "high", confidence: 0.8, blocking: true, rationale: "출시 판정 불가" }],
    unknowns: ["외부 저장소 revision을 알 수 없음"]
  })),
  refineBacklog: vi.fn(async () => ({
    items: [{ key: "define-ac", sourceGapKey: "missing-ac", objectiveId: "objective-1", title: "완료 기준 작성", description: "핵심 흐름 기준을 작성한다", suggestedPriority: "high", suggestedOwner: "hybrid", acceptanceCriteria: ["검토 가능한 기준이 있다"], dependencies: [], roughSize: "s", evidenceRefs: ["gap:missing-ac", "artifact:artifact-source"], risk: null }],
    unknowns: []
  })),
  ...overrides
});

const service = (analysisProvider = provider()) => {
  const projectRepository: ProjectPmRepository = {
    listProjects: vi.fn(async () => [project]),
    loadProjectContext: vi.fn(async () => context())
  };
  const workflowRepository = new MemoryWorkflowRepository();
  return { service: new ProjectLeadershipService({ projectRepository, workflowRepository, analysisProvider, clock: new FixedClock(now) }), projectRepository, workflowRepository };
};

describe("project state projection", () => {
  it("is deterministic and preserves blockers, evidence, and unknown freshness", () => {
    const base = context();
    const first = projectProjectState({ ...base, artifacts: [...base.artifacts, {
      id: "artifact-rejected", artifactType: "document_draft", title: "Rejected", taskId: "task-open",
      workContextId: project.id, contentText: "discarded", contentHash: "rejected-hash", verificationStatus: "verified", reviewStatus: "rejected", createdAt: now
    }] });
    const second = projectProjectState(context());
    expect(first).toEqual(second);
    expect(contentHash(first)).toBe(contentHash(second));
    expect(first.artifacts).toEqual(second.artifacts);
    expect(first.artifacts.map((item) => item.id)).not.toContain("artifact-rejected");
    expect(first.blockers).toEqual([{ taskId: "task-blocked", title: "task-blocked" }]);
    expect(first.sourceRefs).toContainEqual(expect.objectContaining({ ref: "artifact:artifact-source", freshness: "current" }));
    expect(first.sourceRefs).toContainEqual(expect.objectContaining({ ref: "external_reference:external-1", freshness: "unknown" }));
    expect(first.unresolved).toContain("source_freshness_unknown:external-1");
  });
});

describe("ProjectLeadershipService", () => {
  it("closes snapshot, gap analysis, and backlog proposal without creating canonical work", async () => {
    const { service: subject, projectRepository, workflowRepository } = service();
    const result = await subject.run({ userId, workContextId: project.id, timeZone: "Asia/Seoul", idempotencyKey: "project-loop-1" });
    expect(result.snapshot.artifactType).toBe("project_state_snapshot");
    expect(result.gapAnalysis.content.unknowns).toEqual(["외부 저장소 revision을 알 수 없음"]);
    expect(result.backlogProposal.content.items[0]).toMatchObject({ suggestedOwner: "hybrid", sourceGapKey: "missing-ac" });
    expect(workflowRepository.state).toMatchObject({ status: "completed", currentStep: "COMPLETE", checkpointVersion: 3 });
    expect(projectRepository).toEqual(expect.objectContaining({ listProjects: expect.any(Function), loadProjectContext: expect.any(Function) }));
  });

  it("rejects a gap without evidence during typed validation", async () => {
    const invalid = provider({ reviewProjectState: vi.fn(async () => ({ gaps: [{
      key: "unsupported", title: "근거 없음", description: "근거 없음", evidenceRefs: [], priorityHint: "high",
      confidence: 0.5, blocking: false, rationale: "추측"
    }], unknowns: [] })) });
    await expect(service(invalid).service.run({ userId, workContextId: project.id, timeZone: "Asia/Seoul", idempotencyKey: "invalid-gap" }))
      .rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects evidence outside the project snapshot", async () => {
    const invalid = provider({ reviewProjectState: vi.fn(async () => ({ gaps: [{
      key: "foreign", title: "외부", description: "잘못된 범위", evidenceRefs: ["task:foreign"], priorityHint: "low",
      confidence: 0.4, blocking: false, rationale: "범위 밖"
    }], unknowns: [] })) });
    await expect(service(invalid).service.run({ userId, workContextId: project.id, timeZone: "Asia/Seoul", idempotencyKey: "foreign-gap" }))
      .rejects.toMatchObject({ code: "PARSE_INVALID" });
  });

  it("rejects backlog items without acceptance criteria or valid owner", async () => {
    const invalid = provider({ refineBacklog: vi.fn(async () => ({ items: [{
      key: "bad", sourceGapKey: "missing-ac", objectiveId: "objective-1", title: "불완전", description: "불완전",
      suggestedPriority: "high", suggestedOwner: "robot", acceptanceCriteria: [], dependencies: [], roughSize: null,
      evidenceRefs: ["gap:missing-ac"], risk: null
    }], unknowns: [] })) });
    await expect(service(invalid).service.run({ userId, workContextId: project.id, timeZone: "Asia/Seoul", idempotencyKey: "invalid-proposal" }))
      .rejects.toMatchObject({ name: "ZodError" });
  });
});
