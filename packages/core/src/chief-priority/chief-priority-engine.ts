import type { ActionCandidate } from "../candidates/action-candidate.js";
import type { CommitmentLevel } from "../context-management/context-management.js";
import type {
  ChiefPriorityChoice,
  ChiefPriorityDeadlineState,
  ChiefPriorityDecision,
  ChiefPriorityInput,
  ChiefPriorityReasonCode
} from "./chief-priority.js";

interface RankedCandidate {
  readonly candidate: ActionCandidate;
  readonly inputIndex: number;
  readonly mustDo: boolean;
  readonly deadlineState: ChiefPriorityDeadlineState;
  readonly deadlineDate: string | null;
  readonly capacitySlackMinutes: number | null;
}

const localDate = (value: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const read = (type: string): string => parts.find((part) => part.type === type)!.value;
  return `${read("year")}-${read("month")}-${read("day")}`;
};

const deadlineSeverity: Readonly<Record<ChiefPriorityDeadlineState, number>> = {
  OVERDUE: 0,
  DUE_TODAY: 1,
  FUTURE_CAPACITY_DEFICIT: 2,
  DEADLINE_WITHIN_HORIZON: 3,
  NONE: 4
};

const commitmentSeverity: Readonly<Record<CommitmentLevel, number>> = {
  REQUIRED: 0,
  IMPORTANT: 1,
  OPTIONAL: 2
};

const feasibilitySeverity = (value: boolean | null): number => value === true ? 0 : value === null ? 1 : 2;
const commitmentRank = (value: CommitmentLevel | null): number => value === null ? 3 : commitmentSeverity[value];

const compareNullableAscending = (left: number | null, right: number | null): number => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
};

const deadlineEvidence = (
  candidate: ActionCandidate,
  candidates: readonly ActionCandidate[],
  input: ChiefPriorityInput
): Pick<RankedCandidate, "deadlineState" | "deadlineDate" | "capacitySlackMinutes"> => {
  if (candidate.deadline === null) {
    return { deadlineState: "NONE", deadlineDate: null, capacitySlackMinutes: null };
  }

  const { snapshot } = input;
  const today = localDate(snapshot.now, snapshot.timeZone);
  const deadlineDate = localDate(candidate.deadline, snapshot.timeZone);
  if (candidate.deadline < snapshot.now) {
    return { deadlineState: "OVERDUE", deadlineDate, capacitySlackMinutes: null };
  }

  const knownCapacityDates = new Set([today, ...snapshot.constraints.futureCapacity.map((day) => day.date)]);
  if (!knownCapacityDates.has(deadlineDate)) {
    return { deadlineState: "NONE", deadlineDate, capacitySlackMinutes: null };
  }

  const required = candidates.filter((item) => item.deadline !== null
    && localDate(item.deadline, snapshot.timeZone) <= deadlineDate);
  const allEffortKnown = required.every((item) => item.remainingMinutes !== null);
  const availableCapacity = snapshot.constraints.todayCapacity.availableMinutes
    + snapshot.constraints.futureCapacity
      .filter((day) => day.date <= deadlineDate)
      .reduce((sum, day) => sum + day.availableMinutes, 0);
  const requiredWork = required.reduce((sum, item) => sum + (item.remainingMinutes ?? 0), 0);
  const capacitySlackMinutes = allEffortKnown ? availableCapacity - requiredWork : null;

  if (deadlineDate === today) {
    return { deadlineState: "DUE_TODAY", deadlineDate, capacitySlackMinutes };
  }
  return {
    deadlineState: capacitySlackMinutes !== null && capacitySlackMinutes < 0
      ? "FUTURE_CAPACITY_DEFICIT"
      : "DEADLINE_WITHIN_HORIZON",
    deadlineDate,
    capacitySlackMinutes
  };
};

const compareRanked = (left: RankedCandidate, right: RankedCandidate): number =>
  Number(right.mustDo) - Number(left.mustDo)
  || deadlineSeverity[left.deadlineState] - deadlineSeverity[right.deadlineState]
  || compareNullableAscending(left.capacitySlackMinutes, right.capacitySlackMinutes)
  || commitmentRank(left.candidate.contextEvidence.commitmentLevel)
    - commitmentRank(right.candidate.contextEvidence.commitmentLevel)
  || (right.candidate.contextEvidence.strategicImportance ?? Number.NEGATIVE_INFINITY)
    - (left.candidate.contextEvidence.strategicImportance ?? Number.NEGATIVE_INFINITY)
  || feasibilitySeverity(left.candidate.feasibility.canFitToday)
    - feasibilitySeverity(right.candidate.feasibility.canFitToday)
  || right.candidate.importance - left.candidate.importance
  || left.inputIndex - right.inputIndex;

const factualReason = (item: RankedCandidate): ChiefPriorityReasonCode | null => {
  if (item.mustDo) return "USER_MUST_DO";
  if (item.deadlineState !== "NONE") return item.deadlineState;
  if (item.candidate.contextEvidence.commitmentLevel === "REQUIRED") return "REQUIRED_COMMITMENT";
  if (item.candidate.contextEvidence.commitmentLevel === "IMPORTANT") return "IMPORTANT_COMMITMENT";
  if (item.candidate.contextEvidence.strategicImportance !== null) return "STRATEGIC_IMPORTANCE";
  if (item.candidate.feasibility.canFitToday === true) return "FITS_TODAY";
  return null;
};

const differentiatingReason = (
  item: RankedCandidate,
  next: RankedCandidate | undefined
): ChiefPriorityReasonCode | null => {
  if (next === undefined) return factualReason(item);
  if (item.mustDo !== next.mustDo) return item.mustDo ? "USER_MUST_DO" : null;
  if (item.deadlineState !== next.deadlineState) return item.deadlineState === "NONE" ? null : item.deadlineState;
  if (compareNullableAscending(item.capacitySlackMinutes, next.capacitySlackMinutes) !== 0) {
    return item.deadlineState === "NONE" ? null : item.deadlineState;
  }
  const commitment = item.candidate.contextEvidence.commitmentLevel;
  if (commitmentRank(commitment) !== commitmentRank(next.candidate.contextEvidence.commitmentLevel)) {
    if (commitment === "REQUIRED") return "REQUIRED_COMMITMENT";
    if (commitment === "IMPORTANT") return "IMPORTANT_COMMITMENT";
    return null;
  }
  if (item.candidate.contextEvidence.strategicImportance
    !== next.candidate.contextEvidence.strategicImportance) {
    return item.candidate.contextEvidence.strategicImportance === null ? null : "STRATEGIC_IMPORTANCE";
  }
  if (item.candidate.feasibility.canFitToday !== next.candidate.feasibility.canFitToday) {
    return item.candidate.feasibility.canFitToday === true ? "FITS_TODAY" : null;
  }
  if (item.candidate.importance !== next.candidate.importance) return "TASK_IMPORTANCE";
  return null;
};

const whyNowFor = (codes: readonly ChiefPriorityReasonCode[]): string => {
  const dominant = codes[0];
  if (dominant === "USER_MUST_DO") return "오늘 꼭 하기로 지정한 Task라서 가장 먼저 둡니다.";
  if (dominant === "OVERDUE") return "마감이 지난 Task라서 먼저 처리해야 합니다.";
  if (dominant === "DUE_TODAY") return "오늘 마감이라 지금 처리하는 편이 안전합니다.";
  if (dominant === "FUTURE_CAPACITY_DEFICIT") return "마감 전 필요한 작업량이 남은 가용시간을 초과해 지금 시작해야 합니다.";
  if (dominant === "DEADLINE_WITHIN_HORIZON") return "마감이 알려진 가용시간 범위 안에 있어 미리 처리합니다.";
  if (dominant === "REQUIRED_COMMITMENT") return "필수로 지키기로 한 일이라 우선합니다.";
  if (dominant === "IMPORTANT_COMMITMENT") return "중요하게 지키기로 한 일이라 우선합니다.";
  if (dominant === "STRATEGIC_IMPORTANCE") return "현재 중요한 Context에 연결된 Task라서 우선합니다.";
  if (dominant === "FITS_TODAY") return "오늘 남은 가용시간 안에 완료 가능한 Task입니다.";
  if (dominant === "TASK_IMPORTANCE") return "중요도가 높은 Task라서 우선합니다.";
  return "현재 실행 가능한 Task 중 가장 먼저 처리할 항목입니다.";
};

const toChoice = (item: RankedCandidate, next: RankedCandidate | undefined): ChiefPriorityChoice => {
  const reason = differentiatingReason(item, next);
  const reasonCodes = reason === null ? [] : [reason];
  return {
    taskId: item.candidate.taskId,
    title: item.candidate.title,
    reasonCodes,
    whyNow: whyNowFor(reasonCodes),
    evidence: {
      mustDo: item.mustDo,
      deadlineState: item.deadlineState,
      deadlineDate: item.deadlineDate,
      capacitySlackMinutes: item.capacitySlackMinutes,
      commitmentLevel: item.candidate.contextEvidence.commitmentLevel,
      strategicImportance: item.candidate.contextEvidence.strategicImportance,
      canFitToday: item.candidate.feasibility.canFitToday,
      importance: item.candidate.importance
    }
  };
};

/** Deterministic hierarchical priority policy. It performs no I/O and does not mutate its inputs. */
export const decideChiefPriority = (input: ChiefPriorityInput): ChiefPriorityDecision => {
  const mustDoTaskIds = new Set(input.mustDoTaskIds ?? []);
  const ranked: RankedCandidate[] = input.candidates.map((candidate, inputIndex) => ({
    candidate,
    inputIndex,
    mustDo: mustDoTaskIds.has(candidate.taskId),
    ...deadlineEvidence(candidate, input.candidates, input)
  }));
  ranked.sort(compareRanked);
  const choices = ranked.slice(0, 3).map((item, index) => toChoice(item, ranked[index + 1]));
  return {
    mainQuest: choices[0] ?? null,
    upNext: choices.slice(1, 3)
  };
};
