import type { BlockCategory, FocusMessage, FocusMessageHandler, FocusMessageResult, FocusServiceDependencies, RecoveryResult } from "./focus.js";
export declare const classifyBlockReason: (text: string) => BlockCategory | null;
export declare const formatRecovery: (result: RecoveryResult) => string;
export declare class FocusWorkflowService implements FocusMessageHandler {
    private readonly repository;
    private readonly clock;
    constructor(dependencies: FocusServiceDependencies);
    handleFocusMessage(message: FocusMessage): Promise<FocusMessageResult>;
    private handleBlockReason;
    private finishDetailedBlock;
}
//# sourceMappingURL=focus-service.d.ts.map