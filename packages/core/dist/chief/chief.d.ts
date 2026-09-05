import type { Clock, UserId } from "@amber/shared";
import type { DerivedCurrentAction } from "../execution/current-action.js";
import type { MorningObservation } from "../morning/morning.js";
export type ChiefRequestKind = "status" | "next_action";
export interface ChiefApprovedPlan {
    readonly id: string;
    readonly revisionNo: number;
}
export interface ChiefActiveFocus {
    readonly id: string;
    readonly taskId: string;
    readonly title: string;
    readonly startedAt: Date;
}
export interface ChiefContext {
    readonly userId: UserId;
    readonly observedAt: Date;
    readonly planDate: string;
    readonly timeZone: string;
    readonly observation: MorningObservation;
    readonly approvedPlan: ChiefApprovedPlan | null;
    readonly currentAction: DerivedCurrentAction | null;
    readonly activeFocus: ChiefActiveFocus | null;
    readonly replannedToday: boolean;
    readonly weekStartsOn: number;
}
export interface ChiefContextReader {
    loadChiefContext(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<ChiefContext>;
}
export interface ChiefRunRecord {
    readonly reply: string;
}
export interface ChiefRunRecorder {
    findCompleted(userId: UserId, triggerId: string): Promise<ChiefRunRecord | null>;
    recordCompleted(input: {
        readonly context: ChiefContext;
        readonly requestKind: ChiefRequestKind;
        readonly triggerId: string;
        readonly source: string;
        readonly reply: string;
        readonly usedPrincipleIds: readonly string[];
        readonly startedAt: Date;
        readonly completedAt: Date;
    }): Promise<void>;
}
export interface ChiefMessage {
    readonly userId: UserId;
    readonly timeZone: string;
    readonly text: string;
    readonly messageId: string;
    readonly receivedAt: Date;
}
export interface ChiefMessageResult {
    readonly handled: boolean;
    readonly reply?: string;
}
export interface ChiefMessageHandler {
    handleChiefMessage(message: ChiefMessage): Promise<ChiefMessageResult>;
}
export interface ChiefServiceDependencies {
    readonly contextReader: ChiefContextReader;
    readonly clock: Clock;
    readonly runRecorder?: ChiefRunRecorder;
}
//# sourceMappingURL=chief.d.ts.map