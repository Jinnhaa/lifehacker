import type { Clock, UserId } from "@amber/shared";
import type { DecisionLearningCollector } from "../decision-learning/decision-learning.js";
import type { PrincipleProposalFollowUp } from "../principle-approval/principle-approval.js";

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

export interface DayCloseExecutionEvidence {
  readonly events: readonly { id: string; type: string; taskId: string | null; occurredAt: string; actor: string; payload: Record<string, unknown> }[];
  readonly plans: readonly { id: string; revision: number; status: string }[];
  readonly estimates: readonly { taskId: string; workContextId: string | null; estimatedMinutes: number | null; actualMinutes: number | null; deltaMinutes: number | null; completed: boolean; sessionIds: string[]; deadlineAt: string | null; overdueByNextMorning: boolean }[];
  readonly chief: readonly { decisionId: string; selectedTaskIds: string[]; completedTaskIds: string[]; futureReliefTaskId: string | null; executedTaskIds: string[]; notTodayExecutedTaskIds: string[]; alternativeTaskIds: string[]; sessionIds: string[]; reason: null }[];
  readonly corrections: readonly { decisionId: string; feedbackId: string; userChoice: unknown; userReason: string | null }[];
}

export interface DayCloseResult {
  readonly executionEvidence?: DayCloseExecutionEvidence;
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
  readonly executionEvidence?: DayCloseExecutionEvidence;
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
  complete(run: DayCloseWorkflowRun, result: DayCloseResult, messageId: string, now: Date): Promise<{ readonly result: DayCloseResult; readonly duplicate: boolean }>;
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
  readonly wakeFollowUp?: {
    afterDayClose(message: DayCloseMessage): Promise<string | null>;
  };
  readonly decisionLearning?: DecisionLearningCollector;
  readonly principleFollowUp?: PrincipleProposalFollowUp;
}
