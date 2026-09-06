import type { ChiefMessage, ChiefMessageHandler, ChiefMessageResult, ChiefServiceDependencies } from "./chief.js";
export declare class ChiefAgentService implements ChiefMessageHandler {
    private readonly dependencies;
    constructor(dependencies: ChiefServiceDependencies);
    handleChiefMessage(message: ChiefMessage): Promise<ChiefMessageResult>;
    private delegateProject;
    private findPrevious;
}
export declare const isChiefRequest: (text: string) => boolean;
//# sourceMappingURL=chief-service.d.ts.map