import { userIdSchema, type UserId } from "@amber/shared";
import { z } from "zod";
import type { BacklogProposalArtifact, ProjectStateSnapshot } from "./project-leadership.js";

export const backlogDecisionOwnerSchema = z.enum(["human", "ai", "hybrid"]);
export const backlogDecisionPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

const acceptedItemSchema = z.object({
  proposalItemKey: z.string().trim().min(1),
  priorityOverride: backlogDecisionPrioritySchema.optional(),
  ownerOverride: backlogDecisionOwnerSchema.optional()
}).strict();

const excludedItemSchema = z.object({
  proposalItemKey: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional()
}).strict();

export const backlogApprovalDecisionSchema = z.object({
  userId: userIdSchema,
  approvalRequestId: z.uuid(),
  proposalArtifactId: z.uuid(),
  proposalHash: z.string().length(64),
  acceptedItems: z.array(acceptedItemSchema),
  excludedItems: z.array(excludedItemSchema),
  userReason: z.string().trim().min(1).optional()
}).strict();

export type BacklogApprovalDecision = z.infer<typeof backlogApprovalDecisionSchema>;
export type MaterializedRouteStatus = "human_executable" | "ai_executable" | "dependency_waiting";

export interface MaterializedTaskStep {
  readonly id: string;
  readonly taskId: string;
  readonly position: number;
  readonly title: string;
  readonly owner: "user" | "ai";
  readonly status: string;
  readonly route: MaterializedRouteStatus;
}

export interface MaterializedTask {
  readonly id: string;
  readonly proposalItemKey: string;
  readonly title: string;
  readonly importance: number;
  readonly steps: readonly MaterializedTaskStep[];
}

export interface BacklogApprovalRecord {
  readonly id: string;
  readonly userId: UserId;
  readonly workflowRunId: string;
  readonly workflowCheckpointVersion: number;
  readonly workContextId: string;
  readonly proposalArtifactId: string;
  readonly proposalHash: string;
  readonly sourceSnapshotArtifactId: string;
  readonly sourceSnapshotFingerprint: string;
  readonly status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  readonly proposal: BacklogProposalArtifact;
  readonly sourceSnapshot: ProjectStateSnapshot;
}

export interface BacklogApprovalRequestInput {
  readonly userId: UserId;
  readonly proposalArtifactId: string;
  readonly proposalHash: string;
  readonly idempotencyKey: string;
}

export interface BacklogApprovalResult {
  readonly approvalRequestId: string;
  readonly workflowRunId: string;
  readonly decisionId: string;
  readonly tasks: readonly MaterializedTask[];
  readonly excludedItemKeys: readonly string[];
  readonly duplicate: boolean;
}

export interface BacklogApprovalRepository {
  requestApproval(input: BacklogApprovalRequestInput & { readonly now: Date }): Promise<BacklogApprovalRecord>;
  getApproval(userId: UserId, approvalRequestId: string): Promise<BacklogApprovalRecord | null>;
  expireStale(userId: UserId, approvalRequestId: string, now: Date): Promise<void>;
  materialize(input: {
    readonly approval: BacklogApprovalRecord;
    readonly decision: BacklogApprovalDecision;
    readonly currentStateFingerprint: string;
    readonly now: Date;
  }): Promise<BacklogApprovalResult>;
}
