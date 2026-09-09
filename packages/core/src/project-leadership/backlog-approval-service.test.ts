import { FixedClock, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import type { ProjectPmRepository } from "../project-pm/project-pm.js";
import { backlogApprovalDecisionSchema, type BacklogApprovalRecord, type BacklogApprovalRepository } from "./backlog-approval.js";
import { BacklogApprovalService } from "./backlog-approval-service.js";
import { backlogProposalArtifactSchema, projectStateSnapshotSchema } from "./project-leadership.js";
import { contentHash, projectStateFingerprint } from "./project-state-projector.js";

const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const approvalRequestId = "21000000-0000-4000-8000-000000000001";
const proposalArtifactId = "22000000-0000-4000-8000-000000000001";
const snapshot = projectStateSnapshotSchema.parse({
  schemaVersion: "1", workContextId: "project-1", generatedAt: "2026-09-09T03:00:00.000Z",
  project: { id: "project-1", title: "Project", description: null, status: "active", startDate: null, endDate: null },
  primaryObjectiveId: "objective-1",
  objectives: [{ id: "objective-1", goalId: null, title: "Ship", targetDate: null, successCriteria: "done", importance: 5, status: "active" }],
  goals: [], tasks: [], artifacts: [], decisions: [], recentEvents: [],
  sourceRefs: [{ ref: "objective:objective-1", kind: "objective", freshness: "current", observedAt: "2026-09-09T03:00:00.000Z", contentHash: null }],
  blockers: [], unresolved: []
});
const item = (key: string) => ({
  key, sourceGapKey: "gap-1", objectiveId: "objective-1", title: key, description: key,
  suggestedPriority: "medium" as const, suggestedOwner: "human" as const, acceptanceCriteria: ["done"],
  dependencies: [], roughSize: "s" as const, evidenceRefs: ["gap:gap-1"], risk: null
});
const proposal = backlogProposalArtifactSchema.parse({
  schemaVersion: "1", workContextId: "project-1", objectiveId: "objective-1",
  sourceSnapshotArtifactId: "snapshot-1", sourceGapAnalysisArtifactId: "gap-artifact-1",
  sourceRefs: ["gap:gap-1"], generatedAt: "2026-09-09T03:01:00.000Z",
  items: [item("a"), item("b")], unknowns: []
});
const proposalHash = contentHash(proposal);
const approval: BacklogApprovalRecord = {
  id: approvalRequestId, userId, workflowRunId: "workflow-1", workflowCheckpointVersion: 1,
  workContextId: "project-1", proposalArtifactId, proposalHash, sourceSnapshotArtifactId: "snapshot-1",
  sourceSnapshotFingerprint: projectStateFingerprint(snapshot), status: "pending", proposal, sourceSnapshot: snapshot
};

const decision = (overrides: Record<string, unknown> = {}) => ({
  userId, approvalRequestId, proposalArtifactId, proposalHash,
  acceptedItems: [{ proposalItemKey: "a" }], excludedItems: [{ proposalItemKey: "b" }], ...overrides
});

const setup = () => {
  const repository: BacklogApprovalRepository = {
    requestApproval: vi.fn(async () => approval),
    getApproval: vi.fn(async () => approval),
    expireStale: vi.fn(async () => undefined),
    materialize: vi.fn(async () => ({
      approvalRequestId, workflowRunId: "workflow-1", decisionId: "decision-1", tasks: [], excludedItemKeys: ["b"], duplicate: false
    }))
  };
  const projectRepository: ProjectPmRepository = {
    listProjects: vi.fn(async () => []),
    loadProjectContext: vi.fn(async () => { throw new Error("not needed by invalid decisions"); })
  };
  return { service: new BacklogApprovalService({ repository, projectRepository, clock: new FixedClock(new Date("2026-09-09T04:00:00.000Z")) }), repository };
};

describe("backlog approval decision contract", () => {
  it.each([
    { acceptedItems: [{ proposalItemKey: "a", ownerOverride: "robot" }] },
    { acceptedItems: [{ proposalItemKey: "a", priorityOverride: "urgent" }] }
  ])("rejects invalid owner and priority overrides", (override) => {
    expect(() => backlogApprovalDecisionSchema.parse(decision(override))).toThrow();
  });

  it.each([
    decision({ acceptedItems: [{ proposalItemKey: "missing" }], excludedItems: [{ proposalItemKey: "b" }] }),
    decision({ acceptedItems: [{ proposalItemKey: "a" }], excludedItems: [{ proposalItemKey: "a" }, { proposalItemKey: "b" }] }),
    decision({ proposalHash: "0".repeat(64) })
  ])("rejects unknown, duplicate, and hash-mismatched selections before materialization", async (invalid) => {
    const { service, repository } = setup();
    await expect(service.decide(invalid, "Asia/Seoul")).rejects.toMatchObject({ code: expect.any(String) });
    expect(repository.materialize).not.toHaveBeenCalled();
  });
});
