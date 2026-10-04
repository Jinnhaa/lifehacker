import type { WorldContextType, WorldRisk } from "../world-model/world-model.js";

export type ActionCandidateStatus = "INBOX" | "PLANNED" | "IN_PROGRESS";

/** A transient decision-time projection of one canonical Task. */
export interface ActionCandidate {
  readonly taskId: string;
  readonly title: string;
  readonly taskType: "user" | "project" | "learning";
  readonly contextId: string | null;
  readonly contextType: WorldContextType | null;
  readonly contextTitle: string | null;
  readonly status: ActionCandidateStatus;
  readonly importance: number;
  readonly deadline: Date | null;
  readonly deadlineSource: "internal" | "official" | null;
  readonly estimatedMinutes: number | null;
  readonly remainingMinutes: number | null;
  readonly plannedDate: string | null;
  readonly completionCriteria: string | null;
  readonly feasibility: {
    readonly canFitToday: boolean | null;
  };
  readonly evidence: {
    readonly overdue: boolean;
    readonly worldRiskTypes: readonly WorldRisk["type"][];
  };
}
