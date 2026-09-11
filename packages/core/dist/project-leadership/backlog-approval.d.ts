import { type UserId } from "@amber/shared";
import { z } from "zod";
import type { BacklogProposalArtifact, ProjectStateSnapshot } from "./project-leadership.js";
export declare const backlogDecisionOwnerSchema: z.ZodEnum<{
    ai: "ai";
    human: "human";
    hybrid: "hybrid";
}>;
export declare const backlogDecisionPrioritySchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
    critical: "critical";
}>;
export declare const backlogApprovalDecisionSchema: z.ZodObject<{
    userId: z.ZodPipe<z.ZodUUID, z.ZodTransform<UserId, string>>;
    approvalRequestId: z.ZodUUID;
    proposalArtifactId: z.ZodUUID;
    proposalHash: z.ZodString;
    acceptedItems: z.ZodArray<z.ZodObject<{
        proposalItemKey: z.ZodString;
        priorityOverride: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        ownerOverride: z.ZodOptional<z.ZodEnum<{
            ai: "ai";
            human: "human";
            hybrid: "hybrid";
        }>>;
    }, z.core.$strict>>;
    excludedItems: z.ZodArray<z.ZodObject<{
        proposalItemKey: z.ZodString;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    userReason: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
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
    requestApproval(input: BacklogApprovalRequestInput & {
        readonly now: Date;
    }): Promise<BacklogApprovalRecord>;
    getApproval(userId: UserId, approvalRequestId: string): Promise<BacklogApprovalRecord | null>;
    expireStale(userId: UserId, approvalRequestId: string, now: Date): Promise<void>;
    materialize(input: {
        readonly approval: BacklogApprovalRecord;
        readonly decision: BacklogApprovalDecision;
        readonly currentStateFingerprint: string;
        readonly now: Date;
    }): Promise<BacklogApprovalResult>;
}
//# sourceMappingURL=backlog-approval.d.ts.map