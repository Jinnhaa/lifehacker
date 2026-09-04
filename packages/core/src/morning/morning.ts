import type { Clock, UserId } from "@amber/shared";
import type { Task } from "../task/task.js";

export type MorningStep = "observe" | "awaiting_context" | "awaiting_approval" | "completed";

export interface MorningCheckpoint {
  readonly planDate: string;
  readonly timeZone: string;
  readonly workUntil?: string;
  readonly contextReply?: string;
  readonly privateIntervals?: readonly TimeInterval[];
  readonly revisionRequest?: string;
  readonly excludedTaskIds?: readonly string[];
  readonly planId?: string;
  readonly lastMessageId?: string;
}

export interface MorningWorkflowRun {
  readonly id: string;
  readonly userId: UserId;
  readonly status: "running" | "waiting_for_user" | "completed";
  readonly currentStep: MorningStep;
  readonly checkpoint: MorningCheckpoint;
  readonly checkpointVersion: number;
  readonly correlationId: string;
}

export interface TimeInterval {
  readonly start: Date;
  readonly end: Date;
}

export interface MorningConstraint extends TimeInterval {
  readonly id: string;
  readonly title: string | null;
  readonly blocksCapacity: boolean;
  readonly constraintType: string;
  readonly hardness: string;
  readonly origin: string;
}

export interface MorningRecurringActivity {
  readonly id: string;
  readonly title: string;
  readonly targetCount: number;
  readonly expectedMinutes: number;
  readonly minimumMinutes: number | null;
  readonly preferredDays: readonly number[] | null;
  readonly importance: number;
  readonly completedCount: number;
  readonly occurrenceId: string | null;
}

export interface MorningStrategicDirective {
  readonly id: string;
  readonly directive: string;
  readonly priorityOrder: unknown;
}

export interface MorningObservation {
  readonly timeZone: string;
  readonly planningBufferMinutes: number;
  readonly planningPolicy: Readonly<Record<string, unknown>>;
  readonly constraints: readonly MorningConstraint[];
  readonly tasks: readonly Task[];
  readonly recurringActivities: readonly MorningRecurringActivity[];
  readonly strategicDirectives: readonly MorningStrategicDirective[];
}

export interface MorningPlanItemDraft extends TimeInterval {
  readonly itemType: "task" | "routine" | "buffer";
  readonly title: string;
  readonly plannedMinutes: number;
  readonly taskId?: string;
  readonly recurringActivityId?: string;
}

export interface MorningPlanDraft {
  readonly items: readonly MorningPlanItemDraft[];
  readonly fixedEvents: readonly MorningConstraint[];
  readonly highlights: readonly string[];
  readonly inputSnapshot: Readonly<Record<string, unknown>>;
}

export interface MorningPlan {
  readonly id: string;
  readonly revisionNo: number;
  readonly status: "pending_approval" | "approved";
  readonly items: readonly MorningPlanItemDraft[];
  readonly fixedEvents: readonly MorningConstraint[];
  readonly highlights: readonly string[];
}

export interface CurrentAction {
  readonly title: string;
  readonly source: "focus_session" | "plan_item";
}

export interface MorningRepository {
  getOrCreateWorkflow(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<MorningWorkflowRun>;
  findTodayWorkflow(userId: UserId, planDate: string): Promise<MorningWorkflowRun | null>;
  loadObservation(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<MorningObservation>;
  updateCheckpoint(
    run: MorningWorkflowRun,
    checkpoint: MorningCheckpoint,
    step: MorningStep,
    status: MorningWorkflowRun["status"],
    now: Date,
    messageId: string
  ): Promise<MorningWorkflowRun>;
  createProposal(run: MorningWorkflowRun, draft: MorningPlanDraft, now: Date, messageId: string): Promise<MorningPlan>;
  getProposal(run: MorningWorkflowRun): Promise<MorningPlan | null>;
  approve(run: MorningWorkflowRun, now: Date, messageId: string): Promise<{ readonly plan: MorningPlan; readonly duplicate: boolean }>;
  deriveCurrentAction(userId: UserId, planDate: string): Promise<CurrentAction | null>;
}

export interface MorningMessage {
  readonly userId: UserId;
  readonly timeZone: string;
  readonly text: string;
  readonly messageId: string;
  readonly receivedAt: Date;
}

export interface MorningMessageResult {
  readonly handled: boolean;
  readonly reply?: string;
}

export interface MorningMessageHandler {
  handleMorningMessage(message: MorningMessage): Promise<MorningMessageResult>;
}

export interface MorningServiceDependencies {
  readonly repository: MorningRepository;
  readonly clock: Clock;
}
