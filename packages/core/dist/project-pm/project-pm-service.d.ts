import type { ProjectPmMessage, ProjectPmMessageHandler, ProjectPmMessageResult, ProjectPmReportRequest, ProjectPmServiceDependencies } from "./project-pm.js";
export declare class ProjectPmService implements ProjectPmMessageHandler {
    private readonly dependencies;
    constructor(dependencies: ProjectPmServiceDependencies);
    handleProjectPmMessage(message: ProjectPmMessage): Promise<ProjectPmMessageResult>;
    getProjectReport(request: ProjectPmReportRequest): Promise<ProjectPmMessageResult>;
    private findPrevious;
}
export declare const isProjectPmRequest: (text: string) => boolean;
//# sourceMappingURL=project-pm-service.d.ts.map