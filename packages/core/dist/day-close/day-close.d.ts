import type { Clock, UserId } from "@amber/shared";
export interface DayCloseRecurringStatus {
    readonly recurringActivityId: string;
    readonly title: string;
    readonly status: string;
    readonly completed: boolean;
}
export interface DayCloseTaskOutcome {
    readonly taskId: string;
    readonly title: string;
    readonly status: string;
    readonly estimatedMinutes: number | null;
    readonly actualMinutes: number;
    readonly deltaMinutes: number | null;
}
export interface DayCloseResult {
    readonly date: string;
    readonly completedTaskIds: readonly string[];
    readonly incompleteTaskIds: readonly string[];
    readonly blockedTaskIds: readonly string[];
    readonly plannedItemCount: number;
    readonly completedItemCount: number;
    readonly incompleteItemCount: number;
    readonly plannedMinutes: number;
    readonly actualMinutes: number;
    readonly varianceMinutes: number;
    readonly replanCount: number;
    readonly recurringActivityStatus: readonly DayCloseRecurringStatus[];
    readonly carryoverTaskIds: readonly string[];
    readonly taskOutcomes: readonly DayCloseTaskOutcome[];
    readonly closedAt: string;
}
export interface DayClosePlanItem {
    readonly itemType: "task" | "routine";
    readonly status: string;
    readonly plannedMinutes: number;
    readonly taskId: string | null;
    readonly taskStatus: string | null;
    readonly recurringActivityId: string | null;
    readonly recurringTitle: string | null;
    readonly occurrenceStatus: string | null;
}
export interface DayCloseObservation {
    readonly planId: string | null;
    readonly planItems: readonly DayClosePlanItem[];
    readonly completedTaskIds: readonly string[];
    readonly blockedTaskIds: readonly string[];
    readonly actualFocusMinutes: number;
    readonly replanCount: number;
    readonly recurringActivityStatus: readonly DayCloseRecurringStatus[];
    readonly taskOutcomes: readonly DayCloseTaskOutcome[];
}
export interface DayCloseCheckpoint {
    readonly date: string;
    readonly timeZone: string;
    readonly lastMessageId?: string;
    readonly result?: DayCloseResult;
}
export interface DayCloseWorkflowRun {
    readonly id: string;
    readonly userId: UserId;
    readonly status: "running" | "waiting_for_user" | "completed";
    readonly currentStep: "observe" | "awaiting_focus_confirmation" | "completed";
    readonly checkpoint: DayCloseCheckpoint;
    readonly checkpointVersion: number;
    readonly correlationId: string;
}
export interface DayCloseRepository {
    getOrCreateWorkflow(userId: UserId, date: string, timeZone: string, now: Date): Promise<DayCloseWorkflowRun>;
    findWorkflow(userId: UserId, date: string): Promise<DayCloseWorkflowRun | null>;
    hasActiveFocus(userId: UserId): Promise<boolean>;
    awaitFocusConfirmation(run: DayCloseWorkflowRun, messageId: string, now: Date): Promise<DayCloseWorkflowRun>;
    closeActiveFocus(run: DayCloseWorkflowRun, messageId: string, now: Date): Promise<void>;
    loadObservation(userId: UserId, date: string, timeZone: string): Promise<DayCloseObservation>;
    complete(run: DayCloseWorkflowRun, result: DayCloseResult, messageId: string, now: Date): Promise<{
        readonly result: DayCloseResult;
        readonly duplicate: boolean;
    }>;
}
export interface DayCloseMessage {
    readonly userId: UserId;
    readonly timeZone: string;
    readonly text: string;
    readonly messageId: string;
    readonly receivedAt: Date;
}
export interface DayCloseMessageResult {
    readonly handled: boolean;
    readonly reply?: string;
}
export interface DayCloseMessageHandler {
    handleDayCloseMessage(message: DayCloseMessage): Promise<DayCloseMessageResult>;
}
export interface DayCloseServiceDependencies {
    readonly repository: DayCloseRepository;
    readonly clock: Clock;
}
//# sourceMappingURL=day-close.d.ts.map