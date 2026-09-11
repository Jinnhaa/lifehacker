import { type Clock } from "@amber/shared";
import type { ProjectPmRepository } from "../project-pm/project-pm.js";
import { type BacklogApprovalRepository, type BacklogApprovalRequestInput, type BacklogApprovalResult } from "./backlog-approval.js";
export declare class BacklogApprovalService {
    private readonly dependencies;
    constructor(dependencies: {
        readonly repository: BacklogApprovalRepository;
        readonly projectRepository: ProjectPmRepository;
        readonly clock: Clock;
    });
    requestApproval(input: BacklogApprovalRequestInput): Promise<Awaited<ReturnType<BacklogApprovalRepository["requestApproval"]>>>;
    decide(input: unknown, timeZone: string): Promise<BacklogApprovalResult>;
}
//# sourceMappingURL=backlog-approval-service.d.ts.map