import type { Clock, UserId } from "@amber/shared";
import type { DerivedCurrentAction } from "../execution/current-action.js";
import type { DecisionLearningRecorder } from "../decision-learning/decision-learning.js";
export declare const blockCategories: readonly ["unclear", "hard", "avoidance", "perfectionism", "missing_material", "other"];
export type BlockCategory = (typeof blockCategories)[number];
export interface FocusTaskStep {
    readonly id: string;
    readonly position: number;
    readonly title: string;
    readonly owner: "user" | "ai";
    readonly estimatedMinutes: number | null;
    readonly completionCriteria: string | null;
    readonly status: string;
}
export interface FocusContext {
    readonly sessionId: string;
    readonly taskId: string;
    readonly planItemId: string | null;
    readonly taskTitle: string;
    readonly taskCompletionCriteria: string | null;
    readonly estimatedMinutes: number | null;
    readonly nextAction: string | null;
    readonly steps: readonly FocusTaskStep[];
    readonly currentStep: FocusTaskStep | null;
}
export type FocusWorkflowStep = "active" | "awaiting_block_reason" | "awaiting_missing_detail" | "awaiting_other_detail" | "recovery_ready" | "awaiting_switch_confirmation" | "completed";
export interface FocusCheckpoint {
    readonly sessionId: string;
    readonly taskId: string;
    readonly planItemId: string | null;
    readonly blockCategory?: BlockCategory;
    readonly blockDetail?: string;
    readonly pendingStepSplit?: boolean;
    readonly lastMessageId?: string;
    readonly lastReply?: string;
}
export interface FocusWorkflowRun {
    readonly id: string;
    readonly userId: UserId;
    readonly status: "running" | "waiting_for_user" | "completed";
    readonly currentStep: FocusWorkflowStep;
    readonly checkpoint: FocusCheckpoint;
    readonly checkpointVersion: number;
    readonly correlationId: string;
}
export type CompleteFocusResult = {
    readonly kind: "next_step";
    readonly context: FocusContext;
} | {
    readonly kind: "task_completed";
    readonly taskTitle: string;
    readonly nextAction: DerivedCurrentAction | null;
};
export interface RecoveryResult {
    readonly context: FocusContext;
    readonly category: BlockCategory;
    readonly detail: string;
    readonly nextAction: DerivedCurrentAction | null;
}
export interface SwitchResult {
    readonly previousTaskTitle: string;
    readonly nextAction: DerivedCurrentAction | null;
}
export interface FocusRepository {
    findCurrentWorkflow(userId: UserId): Promise<FocusWorkflowRun | null>;
    start(userId: UserId, planDate: string, now: Date, messageId: string): Promise<{
        readonly context: FocusContext | null;
        readonly action: DerivedCurrentAction | null;
        readonly duplicate: boolean;
    }>;
    complete(userId: UserId, planDate: string, now: Date, messageId: string): Promise<CompleteFocusResult | null>;
    requestBlockReason(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null>;
    waitForBlockDetail(userId: UserId, category: "missing_material" | "other", initialDetail: string, now: Date, messageId: string): Promise<void>;
    recordBlock(userId: UserId, planDate: string, category: BlockCategory, detail: string, now: Date, messageId: string): Promise<RecoveryResult | null>;
    resume(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null>;
    requestSwitch(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null>;
    confirmSwitch(userId: UserId, planDate: string, now: Date, messageId: string): Promise<SwitchResult | null>;
}
export interface FocusMessage {
    readonly userId: UserId;
    readonly timeZone: string;
    readonly text: string;
    readonly messageId: string;
    readonly receivedAt: Date;
}
export interface FocusMessageResult {
    readonly handled: boolean;
    readonly reply?: string;
}
export interface FocusMessageHandler {
    handleFocusMessage(message: FocusMessage): Promise<FocusMessageResult>;
}
export interface FocusServiceDependencies {
    readonly repository: FocusRepository;
    readonly clock: Clock;
    readonly replanner?: {
        processLatestTrigger(userId: UserId, timeZone: string, receivedAt: Date): Promise<string | null>;
    };
    readonly decisionLearning?: DecisionLearningRecorder;
}
//# sourceMappingURL=focus.d.ts.map