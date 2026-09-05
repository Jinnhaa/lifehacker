import type { Clock, UserId } from "@amber/shared";
export type MaterialDecisionType = "morning_override" | "important_replan" | "focus_task_switch";
export interface MaterialDecisionInput {
    readonly userId: UserId;
    readonly workflowRunId: string;
    readonly idempotencyKey: string;
    readonly decisionType: MaterialDecisionType;
    readonly situation: Readonly<Record<string, unknown>>;
    readonly amberRecommendation: Readonly<Record<string, unknown>>;
    readonly userChoice: Readonly<Record<string, unknown>>;
    readonly userMessage: string;
    readonly occurredAt: Date;
}
export interface MaterialDecisionRecord {
    readonly decisionId: string;
    readonly feedbackId: string;
    readonly created: boolean;
    readonly needsReason: boolean;
}
export interface DecisionReasonMessage {
    readonly userId: UserId;
    readonly text: string;
    readonly messageId: string;
    readonly receivedAt: Date;
}
export interface DecisionReasonResult {
    readonly handled: boolean;
    readonly reply?: string;
}
export interface DecisionOutcomeInput {
    readonly userId: UserId;
    readonly date: string;
    readonly timeZone: string;
    readonly dayCloseResult: Readonly<Record<string, unknown>>;
    readonly observedAt: Date;
}
export interface DecisionLearningRepository {
    recordMaterialDecision(input: MaterialDecisionInput, userReason: string | null): Promise<MaterialDecisionRecord>;
    recordPendingReason(userId: UserId, reason: string, messageId: string, now: Date): Promise<boolean>;
    createLearningCasesForDay(input: DecisionOutcomeInput): Promise<number>;
}
export interface DecisionLearningRecorder {
    recordMaterialDecision(input: MaterialDecisionInput): Promise<string | null>;
}
export interface DecisionLearningCollector {
    collectDayCloseOutcomes(input: DecisionOutcomeInput): Promise<number>;
    handleReasonMessage(message: DecisionReasonMessage): Promise<DecisionReasonResult>;
}
export interface DecisionLearningDependencies {
    readonly repository: DecisionLearningRepository;
    readonly clock: Clock;
}
//# sourceMappingURL=decision-learning.d.ts.map