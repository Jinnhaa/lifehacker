import type { Clock, UserId } from "@amber/shared";
import type { DerivedCurrentAction } from "../execution/current-action.js";
import type { MorningObservation, MorningPlan, MorningPlanDraft, MorningPlanItemDraft, MorningRepository } from "../morning/morning.js";
import type { ReplanTriggerReason } from "../rules/replan.js";
import type { DecisionLearningRecorder } from "../decision-learning/decision-learning.js";
import type { ChiefReplanAdjustment } from "./chief-replan-request.js";

export type ReplanImpact = "SMALL_CHANGE" | "IMPORTANT_CHANGE";

export interface ReplanTrigger {
  readonly id: string;
  readonly userId: UserId;
  readonly reason: ReplanTriggerReason;
  readonly deltaMinutes: number;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly adjustment?: ChiefReplanAdjustment;
}

export interface ReplanPlanItem extends MorningPlanItemDraft {
  readonly id: string;
  readonly status: string;
  readonly taskStatus: string | null;
  readonly taskImportance: number | null;
  readonly taskDeadline: Date | null;
}

export interface ReplanPlanState {
  readonly planId: string;
  readonly revisionNo: number;
  readonly planDate: string;
  readonly timeZone: string;
  readonly workUntil: Date;
  readonly privateIntervals: readonly { readonly start: Date; readonly end: Date }[];
  readonly items: readonly ReplanPlanItem[];
  readonly activeTaskId: string | null;
}

export interface ReplanDecision {
  readonly impact: ReplanImpact;
  readonly reasons: readonly string[];
}

export interface ReplanWorkflowRun {
  readonly id: string;
  readonly userId: UserId;
  readonly status: "waiting_for_user" | "completed";
  readonly currentStep: "awaiting_approval" | "completed";
  readonly checkpointVersion: number;
  readonly correlationId: string;
  readonly planDate: string;
  readonly timeZone: string;
  readonly planId: string;
  readonly triggerId: string;
  readonly impact: ReplanImpact;
  readonly impactReasons?: readonly string[];
  readonly lastMessageId?: string;
}

export interface ReplanRevisionResult {
  readonly workflow: ReplanWorkflowRun;
  readonly plan: MorningPlan;
  readonly duplicate: boolean;
}

export interface ReplanRepository {
  findLatestPendingTrigger(userId: UserId): Promise<ReplanTrigger | null>;
  createManualTrigger(userId: UserId, now: Date, messageId: string, adjustment: ChiefReplanAdjustment): Promise<ReplanTrigger>;
  findPendingApproval(userId: UserId, planDate: string): Promise<ReplanWorkflowRun | null>;
  findCompletedApprovalByMessage(userId: UserId, planDate: string, messageId: string): Promise<ReplanWorkflowRun | null>;
  findByTrigger(userId: UserId, triggerId: string): Promise<ReplanRevisionResult | null>;
  loadPlanState(userId: UserId, planDate: string): Promise<ReplanPlanState | null>;
  createRevision(
    trigger: ReplanTrigger,
    stateHash: string,
    previous: ReplanPlanState,
    draft: MorningPlanDraft,
    decision: ReplanDecision,
    now: Date
  ): Promise<ReplanRevisionResult>;
  reject(workflow: ReplanWorkflowRun, now: Date, messageId: string): Promise<{ readonly duplicate: boolean }>;
  deriveCurrentAction(userId: UserId, planDate: string): Promise<DerivedCurrentAction | null>;
}

export interface ReplanProcessor {
  processLatestTrigger(userId: UserId, timeZone: string, receivedAt: Date): Promise<string | null>;
}

export interface ReplanMessage {
  readonly userId: UserId;
  readonly timeZone: string;
  readonly text: string;
  readonly messageId: string;
  readonly receivedAt: Date;
}

export interface ReplanMessageResult {
  readonly handled: boolean;
  readonly reply?: string;
}

export interface ReplanMessageHandler {
  handleReplanMessage(message: ReplanMessage): Promise<ReplanMessageResult>;
}

export interface ReplanServiceDependencies {
  readonly repository: ReplanRepository;
  readonly observationReader: Pick<MorningRepository, "loadObservation" | "approve">;
  readonly clock: Clock;
  readonly decisionLearning?: DecisionLearningRecorder;
}

export interface BuildReplanDraftInput {
  readonly observation: MorningObservation;
  readonly previous: ReplanPlanState;
  readonly now: Date;
  readonly adjustment?: ChiefReplanAdjustment;
}
