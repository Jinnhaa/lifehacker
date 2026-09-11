import { DomainError } from "@amber/shared";
import { documentDraftArtifactContentSchema } from "../agent-execution/ai-task-execution.js";
import { artifactReviewCommandSchema } from "./artifact-review.js";
const criteria = (value) => value?.split("\n").map((item) => item.trim()).filter(Boolean) ?? [];
export const assertAcceptableArtifact = (target) => {
    if (target.verificationStatus !== "verified")
        throw new DomainError("CONFLICT", "Only a verified Artifact can be accepted");
    let raw;
    try {
        raw = JSON.parse(target.contentText);
    }
    catch {
        throw new DomainError("PARSE_INVALID", "Artifact content is not valid JSON");
    }
    const content = documentDraftArtifactContentSchema.safeParse(raw);
    if (!content.success || content.data.taskStepId !== target.taskStepId) {
        throw new DomainError("PARSE_INVALID", "Artifact content does not match its TaskStep");
    }
    const missing = criteria(target.taskStepCompletionCriteria).filter((item) => !content.data.addressedCriteria.includes(item));
    if (missing.length > 0)
        throw new DomainError("PARSE_INVALID", "Artifact does not satisfy TaskStep completion criteria", { missing });
};
export class ArtifactReviewService {
    dependencies;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async review(input, timeZone, constraints = []) {
        const parsed = artifactReviewCommandSchema.safeParse(input);
        if (!parsed.success)
            throw new DomainError("INVALID_INPUT", "Artifact review command is invalid", { issues: parsed.error.issues });
        const command = parsed.data;
        const target = await this.dependencies.repository.loadTarget(command.userId, command.artifactId);
        if (!target)
            throw new DomainError("INVALID_INPUT", "Artifact is not available for review");
        if (target.workContextId !== command.workContextId)
            throw new DomainError("CROSS_USER_ACCESS", "Artifact is outside the requested Project scope");
        if (target.contentHash !== command.artifactContentHash)
            throw new DomainError("CONFLICT", "Artifact content changed before review");
        if (command.decision === "accept")
            assertAcceptableArtifact(target);
        const review = await this.dependencies.repository.recordReview({ command, target, now: this.dependencies.clock.now() });
        if (command.decision === "revise") {
            const revisionExecution = await this.dependencies.aiExecutionService.dispatch({
                userId: command.userId, taskStepId: target.taskStepId, timeZone,
                revisionRequest: { revisionOfArtifactId: target.artifactId, decisionId: review.decisionId, instruction: command.revisionInstruction,
                    originalContentText: target.contentText, originalContentHash: target.contentHash }
            });
            return { ...review, revisionExecution };
        }
        if (command.decision === "accept") {
            const nextIteration = await this.dependencies.projectLeadershipService.run({
                userId: command.userId, workContextId: command.workContextId, timeZone, constraints,
                idempotencyKey: `project-feedback:${target.artifactId}:${target.contentHash}`,
                correlationId: review.correlationId, causationId: review.reviewEventId
            });
            return { ...review, nextIteration };
        }
        return review;
    }
}
//# sourceMappingURL=artifact-review-service.js.map