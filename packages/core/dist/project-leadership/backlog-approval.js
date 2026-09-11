import { userIdSchema } from "@amber/shared";
import { z } from "zod";
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
//# sourceMappingURL=backlog-approval.js.map