import type { LearningRecoveryMode } from "./learning-v2.js";

export interface LearningRecoveryInput {
  readonly recoveryMode: LearningRecoveryMode;
  readonly normalTargetUnits: number;
  readonly missedUnits: number;
  readonly existingPendingUnits: number;
  /** Explicit maximum for a carry-forward day. Null means no safe automatic proposal. */
  readonly carryForwardLimitUnits: number | null;
}

export interface LearningRecoveryProposal {
  readonly recoveryMode: LearningRecoveryMode;
  readonly pendingUnits: number | null;
  readonly proposedNextEligibleDayUnits: number | null;
  readonly treatment: "REDISTRIBUTE_OVER_FUTURE_CAPACITY" | "RESET_WITHOUT_BACKLOG" | "CARRY_FORWARD_WITH_LIMIT" | "MANUAL_DECISION_REQUIRED";
  readonly reasons: readonly { readonly code: string; readonly evidence: Readonly<Record<string, number | string | null>> }[];
}

const validUnits = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative`);
};

/** Pure proposal only. Source allocation and learning state are never mutated. */
export function deriveLearningRecovery(input: LearningRecoveryInput): LearningRecoveryProposal {
  validUnits(input.normalTargetUnits, "normalTargetUnits");
  validUnits(input.missedUnits, "missedUnits");
  validUnits(input.existingPendingUnits, "existingPendingUnits");
  if (input.carryForwardLimitUnits !== null) validUnits(input.carryForwardLimitUnits, "carryForwardLimitUnits");
  const pending = input.missedUnits + input.existingPendingUnits;
  switch (input.recoveryMode) {
    case "REDISTRIBUTE":
      return {
        recoveryMode: input.recoveryMode,
        pendingUnits: pending,
        proposedNextEligibleDayUnits: null,
        treatment: "REDISTRIBUTE_OVER_FUTURE_CAPACITY",
        reasons: [{ code: "MISSED_UNITS_REMAIN_IN_WORKLOAD", evidence: { pendingUnits: pending } }]
      };
    case "RESET":
      return {
        recoveryMode: input.recoveryMode,
        pendingUnits: 0,
        proposedNextEligibleDayUnits: input.normalTargetUnits,
        treatment: "RESET_WITHOUT_BACKLOG",
        reasons: [{ code: "MISSED_UNITS_DISCARDED", evidence: { missedUnits: input.missedUnits } }]
      };
    case "CARRY_FORWARD": {
      const next = input.carryForwardLimitUnits === null
        ? null : Math.min(input.carryForwardLimitUnits, input.normalTargetUnits + pending);
      return {
        recoveryMode: input.recoveryMode,
        pendingUnits: pending,
        proposedNextEligibleDayUnits: next,
        treatment: input.carryForwardLimitUnits === null ? "MANUAL_DECISION_REQUIRED" : "CARRY_FORWARD_WITH_LIMIT",
        reasons: [{ code: input.carryForwardLimitUnits === null ? "CARRY_FORWARD_LIMIT_MISSING" : "CARRY_FORWARD_LIMIT_APPLIED",
          evidence: { pendingUnits: pending, limitUnits: input.carryForwardLimitUnits } }]
      };
    }
    case "MANUAL":
      return {
        recoveryMode: input.recoveryMode,
        pendingUnits: null,
        proposedNextEligibleDayUnits: null,
        treatment: "MANUAL_DECISION_REQUIRED",
        reasons: [{ code: "RECOVERY_REQUIRES_MANUAL_DECISION", evidence: { missedUnits: input.missedUnits } }]
      };
  }
}
