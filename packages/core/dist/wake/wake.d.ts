import type { Clock, UserId } from "@amber/shared";
export type WakeSource = "user" | "preference" | "personal_constraint" | "snooze";
export type WakeStep = "awaiting_time" | "scheduled" | "acknowledged" | "cancelled";
export interface WakeCheckpoint {
    readonly targetDate: string;
    readonly timeZone: string;
    readonly wakeAt?: string;
    readonly source?: WakeSource;
    readonly firstConstraintTitle?: string;
    readonly firstConstraintAt?: string;
    readonly lastMessageId?: string;
    readonly acknowledgedAt?: string;
}
export interface WakeWorkflowRun {
    readonly id: string;
    readonly userId: UserId;
    readonly status: "running" | "waiting_for_user" | "completed";
    readonly currentStep: WakeStep;
    readonly checkpoint: WakeCheckpoint;
    readonly checkpointVersion: number;
    readonly correlationId: string;
}
export interface WakeTargetContext {
    readonly preferredWakeTime: string | null;
    readonly preferenceSource: "preference" | "personal_constraint" | null;
    readonly firstConstraint: {
        readonly title: string | null;
        readonly start: Date;
    } | null;
}
export interface WakeDeliveryClaim {
    readonly jobId: string;
    readonly notificationId: string;
    readonly userId: UserId;
    readonly discordUserId: string;
    readonly wakeAt: Date;
    readonly timeZone: string;
    readonly firstConstraintTitle: string | null;
    readonly firstConstraintAt: Date | null;
}
export interface WakeRepository {
    findWorkflow(userId: UserId, targetDate: string): Promise<WakeWorkflowRun | null>;
    getOrCreateAwaitingWorkflow(userId: UserId, targetDate: string, timeZone: string, context: WakeTargetContext, now: Date): Promise<WakeWorkflowRun>;
    loadTargetContext(userId: UserId, targetDate: string, timeZone: string): Promise<WakeTargetContext>;
    schedule(run: WakeWorkflowRun, wakeAt: Date, source: WakeSource, messageId: string, now: Date): Promise<WakeWorkflowRun>;
    acknowledgeForDate(userId: UserId, targetDate: string, messageId: string, now: Date): Promise<void>;
    snooze(userId: UserId, targetDate: string, wakeAt: Date, messageId: string, now: Date): Promise<boolean>;
    claimDue(now: Date): Promise<WakeDeliveryClaim | null>;
    completeDelivery(claim: WakeDeliveryClaim, now: Date): Promise<void>;
    failDelivery(claim: WakeDeliveryClaim, error: string, now: Date): Promise<void>;
}
export interface WakeMessage {
    readonly userId: UserId;
    readonly timeZone: string;
    readonly text: string;
    readonly messageId: string;
    readonly receivedAt: Date;
}
export interface WakeMessageResult {
    readonly handled: boolean;
    readonly reply?: string;
}
export interface WakeMessageHandler {
    handleWakeMessage(message: WakeMessage): Promise<WakeMessageResult>;
}
export interface WakeDayCloseFollowUp {
    afterDayClose(message: WakeMessage): Promise<string | null>;
}
export interface WakeServiceDependencies {
    readonly repository: WakeRepository;
    readonly clock: Clock;
}
//# sourceMappingURL=wake.d.ts.map