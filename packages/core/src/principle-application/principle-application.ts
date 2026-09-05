import { getDaysUntilDeadline } from "../rules/deadline.js";

export interface ApprovedPlanningPrinciple {
  readonly id: string;
  readonly statement: string;
  readonly origin: string;
  readonly decisionType: string;
  readonly situationType: string;
  readonly choiceAction: string;
  readonly consistencyKind: string;
  readonly consistencyValue: string;
  readonly applicationPolicy: string;
}

export interface PlanningPriorityCandidate {
  readonly type: "task" | "routine";
  readonly id: string;
  readonly rank: number;
  readonly importance: number;
  readonly deadline: Date | null;
  readonly title: string;
}

export interface AppliedPrincipleResult<T extends PlanningPriorityCandidate> {
  readonly candidates: readonly T[];
  readonly usedPrincipleIds: readonly string[];
  readonly explanation: string | null;
}

const compare = (left: PlanningPriorityCandidate, right: PlanningPriorityCandidate): number =>
  left.rank - right.rank
  || right.importance - left.importance
  || (left.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER)
  || left.title.localeCompare(right.title);

const supportsDeadlinePreference = (principle: ApprovedPlanningPrinciple): boolean =>
  principle.origin === "pattern_observed"
  && principle.applicationPolicy === "deadline_over_routine";

export const applyApprovedPrinciples = <T extends PlanningPriorityCandidate>(
  candidates: readonly T[],
  principles: readonly ApprovedPlanningPrinciple[],
  now: Date,
  timeZone: string
): AppliedPrincipleResult<T> => {
  const baseline = [...candidates].sort(compare);
  const applicable = principles.filter(supportsDeadlinePreference);
  if (applicable.length === 0 || !baseline.some((item) => item.type === "routine")) {
    return { candidates: baseline, usedPrincipleIds: [], explanation: null };
  }
  const adjusted = baseline.map((candidate) => {
    if (candidate.type !== "task") return candidate;
    const days = getDaysUntilDeadline(candidate.deadline, now, timeZone);
    return days !== null && days >= 0 && days <= 3
      ? { ...candidate, rank: Math.max(1, candidate.rank - 2) }
      : candidate;
  }).sort(compare) as T[];
  const changed = adjusted.some((candidate, index) => candidate.id !== baseline[index]?.id);
  return changed
    ? {
        candidates: adjusted,
        usedPrincipleIds: applicable.map((principle) => principle.id),
        explanation: "이전에 승인한 기준대로 마감이 가까운 Task를 먼저 배치했어."
      }
    : { candidates: baseline, usedPrincipleIds: [], explanation: null };
};
