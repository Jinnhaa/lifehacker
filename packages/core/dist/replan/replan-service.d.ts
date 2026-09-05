import type { UserId } from "@amber/shared";
import type { ReplanMessage, ReplanMessageHandler, ReplanMessageResult, ReplanServiceDependencies } from "./replan.js";
export declare class DynamicReplanningService implements ReplanMessageHandler {
    private readonly repository;
    private readonly observationReader;
    private readonly clock;
    private readonly decisionLearning;
    constructor(dependencies: ReplanServiceDependencies);
    processLatestTrigger(userId: UserId, timeZone: string, receivedAt: Date): Promise<string | null>;
    handleReplanMessage(message: ReplanMessage): Promise<ReplanMessageResult>;
    private recordImportantDecision;
    private processTrigger;
}
//# sourceMappingURL=replan-service.d.ts.map