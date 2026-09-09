import { type Clock } from "@amber/shared";
import type { ProjectPmRepository } from "../project-pm/project-pm.js";
import { type ProjectLeadershipAnalysisProvider, type ProjectLeadershipRepository, type ProjectLeadershipRunRequest, type ProjectLeadershipRunResult } from "./project-leadership.js";
export declare class ProjectLeadershipService {
    private readonly dependencies;
    constructor(dependencies: {
        readonly projectRepository: ProjectPmRepository;
        readonly workflowRepository: ProjectLeadershipRepository;
        readonly analysisProvider: ProjectLeadershipAnalysisProvider;
        readonly clock: Clock;
    });
    run(request: ProjectLeadershipRunRequest): Promise<ProjectLeadershipRunResult>;
    private completedResult;
}
//# sourceMappingURL=project-leadership-service.d.ts.map