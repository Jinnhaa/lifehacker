import type { DayCloseMessage, DayCloseMessageHandler, DayCloseMessageResult, DayCloseObservation, DayCloseResult, DayCloseServiceDependencies } from "./day-close.js";
export declare const calculateDayCloseResult: (observation: DayCloseObservation, date: string, closedAt: Date) => DayCloseResult;
export declare class DayCloseService implements DayCloseMessageHandler {
    private readonly repository;
    private readonly clock;
    private readonly wakeFollowUp;
    private readonly decisionLearning;
    constructor(dependencies: DayCloseServiceDependencies);
    handleDayCloseMessage(message: DayCloseMessage): Promise<DayCloseMessageResult>;
    private finish;
    private collectLearning;
    private withWakeFollowUp;
}
//# sourceMappingURL=day-close-service.d.ts.map