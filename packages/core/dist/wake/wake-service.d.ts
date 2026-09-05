import type { WakeDayCloseFollowUp, WakeMessage, WakeMessageHandler, WakeMessageResult, WakeServiceDependencies } from "./wake.js";
export declare class WakeWorkflowService implements WakeMessageHandler, WakeDayCloseFollowUp {
    private readonly repository;
    private readonly clock;
    constructor(dependencies: WakeServiceDependencies);
    afterDayClose(message: WakeMessage): Promise<string | null>;
    handleWakeMessage(message: WakeMessage): Promise<WakeMessageResult>;
}
//# sourceMappingURL=wake-service.d.ts.map