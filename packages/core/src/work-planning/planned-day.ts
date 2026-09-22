import type { CurrentStatusPriorityBand } from "../chief/current-status.js";

export interface PlannedDayEvidence {
  readonly plannedDate: string | null;
  readonly approvedPlanDate: string | null;
  readonly internalDeadlineDate: string | null;
  readonly officialDeadlineDate: string | null;
  readonly priorityBand: CurrentStatusPriorityBand | null;
}

export type PlannedDayProjection = { readonly date: string; readonly source: "user" | "plan" | "chief" };

export const projectPlannedDay = (evidence: PlannedDayEvidence, today: string): PlannedDayProjection => {
  if (evidence.plannedDate) return { date: evidence.plannedDate, source: "user" };
  if (evidence.priorityBand === "P0" || evidence.priorityBand === "P1") return { date: today, source: "chief" };
  if (evidence.approvedPlanDate) return { date: evidence.approvedPlanDate, source: "plan" };
  return { date: evidence.internalDeadlineDate ?? evidence.officialDeadlineDate ?? today, source: "chief" };
};

export const comparePriorityBands = (left: CurrentStatusPriorityBand | null, right: CurrentStatusPriorityBand | null): number => {
  const order: Record<CurrentStatusPriorityBand, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  return (left ? order[left] : 5) - (right ? order[right] : 5);
};
