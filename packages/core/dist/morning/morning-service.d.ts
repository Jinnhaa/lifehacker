import type { MorningMessage, MorningMessageHandler, MorningMessageResult, MorningServiceDependencies } from "./morning.js";
export declare class MorningWorkflowService implements MorningMessageHandler {
    private readonly repository;
    private readonly clock;
    constructor(dependencies: MorningServiceDependencies);
    handleMorningMessage(message: MorningMessage): Promise<MorningMessageResult>;
    private resumeReply;
    private start;
    private receiveContext;
    private revise;
    private prepareProposal;
    private approve;
}
//# sourceMappingURL=morning-service.d.ts.map