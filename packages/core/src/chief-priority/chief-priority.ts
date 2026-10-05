import type { CommitmentLevel } from "../context-management/context-management.js";
import type { ActionCandidate } from "../candidates/action-candidate.js";
import type { WorldModelSnapshot } from "../world-model/world-model.js";

export type ChiefPriorityDeadlineState =
  | "OVERDUE"
  | "DUE_TODAY"
  | "FUTURE_CAPACITY_DEFICIT"
  | "DEADLINE_WITHIN_HORIZON"
  | "NONE";

export type ChiefPriorityReasonCode =
  | "USER_MUST_DO"
  | "OVERDUE"
  | "DUE_TODAY"
  | "FUTURE_CAPACITY_DEFICIT"
  | "DEADLINE_WITHIN_HORIZON"
  | "REQUIRED_COMMITMENT"
  | "IMPORTANT_COMMITMENT"
  | "STRATEGIC_IMPORTANCE"
  | "FITS_TODAY"
  | "TASK_IMPORTANCE";

export interface ChiefPriorityInput {
  readonly snapshot: WorldModelSnapshot;
  readonly candidates: readonly ActionCandidate[];
  readonly mustDoTaskIds?: readonly string[];
}

export interface ChiefPriorityChoice {
  readonly taskId: string;
  readonly title: string;
  readonly reasonCodes: readonly ChiefPriorityReasonCode[];
  readonly whyNow: string;
  readonly evidence: {
    readonly mustDo: boolean;
    readonly deadlineState: ChiefPriorityDeadlineState;
    readonly deadlineDate: string | null;
    readonly capacitySlackMinutes: number | null;
    readonly commitmentLevel: CommitmentLevel | null;
    readonly strategicImportance: number | null;
    readonly canFitToday: boolean | null;
    readonly importance: number;
  };
}

export interface ChiefPriorityDecision {
  readonly mainQuest: ChiefPriorityChoice | null;
  readonly upNext: readonly ChiefPriorityChoice[];
}
