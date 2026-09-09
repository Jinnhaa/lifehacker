import { userIdSchema, type UserId } from "@amber/shared";
import { z } from "zod";
import type { AiTaskExecutionResult } from "../agent-execution/ai-task-execution.js";
import type { ProjectLeadershipRunResult } from "../project-leadership/project-leadership.js";

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
export type ArtifactReviewCommand = z.infer<typeof artifactReviewCommandSchema>;

export interface ArtifactReviewTarget {
  readonly userId: UserId;
  readonly artifactId: string;
  readonly contentHash: string;
  readonly contentText: string;
  readonly verificationStatus: string | null;
  readonly reviewStatus: string | null;
  readonly workContextId: string;
  readonly taskId: string;
  readonly taskStatus: string;
  readonly taskExecutionMode: string;
  readonly taskStepId: string;
  readonly taskStepStatus: string;
  readonly taskStepPosition: number;
  readonly taskStepCompletionCriteria: string | null;
  readonly sourceAgentRunId: string;
}

export interface ArtifactReviewRecord {
  readonly artifactId: string;
  readonly decisionId: string;
  readonly reviewEventId: string;
  readonly correlationId: string;
  readonly decision: "accept" | "revise" | "reject";
  readonly taskCompleted: boolean;
  readonly duplicate: boolean;
}

export interface ArtifactReviewRepository {
  loadTarget(userId: UserId, artifactId: string): Promise<ArtifactReviewTarget | null>;
  recordReview(input: { readonly command: ArtifactReviewCommand; readonly target: ArtifactReviewTarget; readonly now: Date }): Promise<ArtifactReviewRecord>;
}

export interface ArtifactReviewResult extends ArtifactReviewRecord {
  readonly revisionExecution?: AiTaskExecutionResult;
  readonly nextIteration?: ProjectLeadershipRunResult;
}
