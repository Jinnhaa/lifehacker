import { userIdSchema } from "@amber/shared";
import { z } from "zod";
export const artifactReviewCommandSchema = z.object({
    userId: userIdSchema,
    workContextId: z.string().uuid(),
    artifactId: z.string().uuid(),
    artifactContentHash: z.string().length(64),
    decision: z.enum(["accept", "revise", "reject"]),
    reason: z.string().trim().min(1).optional(),
    revisionInstruction: z.string().trim().min(1).optional(),
    idempotencyKey: z.string().trim().min(1).max(500)
}).strict().superRefine((value, context) => {
    if (value.decision === "revise" && !value.revisionInstruction) {
        context.addIssue({ code: "custom", path: ["revisionInstruction"], message: "Revision requires an instruction" });
    }
});
//# sourceMappingURL=artifact-review.js.map