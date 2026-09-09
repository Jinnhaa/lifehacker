import { type Clock, type UserId } from "@amber/shared";
import type { ProjectPmRepository } from "../project-pm/project-pm.js";
import { type AiTaskExecutionRepository, type AiTaskExecutionResult, type AiTaskExecutor } from "./ai-task-execution.js";
export declare class AiTaskExecutionService {
    private readonly dependencies;
    constructor(dependencies: {
        readonly repository: AiTaskExecutionRepository;
        readonly projectRepository: ProjectPmRepository;
        readonly executor: AiTaskExecutor;
        readonly clock: Clock;
    });
    dispatch(input: {
        readonly userId: UserId;
        readonly taskStepId: string;
        readonly timeZone: string;
        readonly revisionRequest?: {
            readonly revisionOfArtifactId: string;
            readonly decisionId: string;
            readonly instruction: string;
            readonly originalContentText: string;
            readonly originalContentHash: string;
        };
    }): Promise<AiTaskExecutionResult>;
}
//# sourceMappingURL=ai-task-execution-service.d.ts.map