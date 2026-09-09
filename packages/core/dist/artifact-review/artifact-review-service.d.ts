import { type Clock } from "@amber/shared";
import type { AiTaskExecutionService } from "../agent-execution/ai-task-execution-service.js";
import type { ProjectLeadershipService } from "../project-leadership/project-leadership-service.js";
import { type ArtifactReviewRepository, type ArtifactReviewResult, type ArtifactReviewTarget } from "./artifact-review.js";
export declare const assertAcceptableArtifact: (target: ArtifactReviewTarget) => void;
export declare class ArtifactReviewService {
    private readonly dependencies;
    constructor(dependencies: {
        readonly repository: ArtifactReviewRepository;
        readonly aiExecutionService: Pick<AiTaskExecutionService, "dispatch">;
        readonly projectLeadershipService: Pick<ProjectLeadershipService, "run">;
        readonly clock: Clock;
    });
    review(input: unknown, timeZone: string, constraints?: readonly string[]): Promise<ArtifactReviewResult>;
}
//# sourceMappingURL=artifact-review-service.d.ts.map