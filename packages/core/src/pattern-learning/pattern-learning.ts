import type { UserId } from "@amber/shared";

export const PATTERN_EVALUATOR_VERSION = "decision-pattern-v0.1";
export const MIN_PATTERN_EVIDENCE = 3;

export interface PatternLearningCase {
  readonly id: string;
  readonly decisionType: string;
  readonly situation: Readonly<Record<string, unknown>>;
  readonly userChoice: Readonly<Record<string, unknown>>;
  readonly userReason: string | null;
  readonly observedOutcome: Readonly<Record<string, unknown>>;
  readonly observedAt: Date;
}

export interface PatternCandidate {
  readonly signature: string;
  readonly decisionType: string;
  readonly situationType: string;
  readonly choiceAction: string;
  readonly consistencyKind: "reason" | "outcome";
  readonly consistencyValue: string;
  readonly observedBehavior: string;
  readonly evidence: readonly PatternLearningCase[];
  readonly confidence: number;
}

export interface PatternEvaluationResult {
  readonly created: number;
  readonly strengthened: number;
}

export interface PatternLearningEvaluator {
  evaluatePatterns(userId: UserId): Promise<PatternEvaluationResult>;
}

const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").sort()
  : [];

const situationType = (item: PatternLearningCase): string => {
  const tags = [...strings(item.situation.impactReasons), ...strings(item.situation.reasons)];
  if (tags.length > 0) return [...new Set(tags)].sort().join("+");
  if (item.decisionType === "focus_task_switch") return "focus_guardrail";
  if (item.decisionType === "important_replan") return "important_change";
  if (item.decisionType === "morning_override") return "morning_priority_override";
  return "unspecified";
};

const reasonType = (reason: string | null): string | null => {
  if (!reason) return null;
  if (/(마감|기한|급한|deadline)/i.test(reason)) return "deadline_priority";
  if (/(루틴|습관|운동|학습)/.test(reason)) return "routine_priority";
  if (/(피곤|수면|잠|체력)/.test(reason)) return "fatigue";
  if (/(집중|몰입|산만)/.test(reason)) return "focus_difficulty";
  if (/(일정|약속|회의|수업)/.test(reason)) return "schedule_conflict";
  return null;
};

const outcomeType = (outcome: Readonly<Record<string, unknown>>): string | null => {
  if(typeof outcome.signal === "string") return outcome.signal;
  if (Array.isArray(outcome.blockedTaskIds) && outcome.blockedTaskIds.length > 0) return "task_blocked";
  if (Array.isArray(outcome.completedTaskIds) && outcome.completedTaskIds.length > 0) return "task_completed";
  if (typeof outcome.varianceMinutes === "number") {
    if (outcome.varianceMinutes < 0) return "below_planned_time";
    if (outcome.varianceMinutes > 0) return "above_planned_time";
    return "matched_planned_time";
  }
  return null;
};

const contextText = (decisionType: string, situation: string): string => {
  if (situation.includes("deadline")) return "마감 위험이 있는 중요한 일정 변경에서";
  if (situation.includes("protected_routine")) return "보호된 루틴이 영향을 받는 일정 변경에서";
  if (decisionType === "focus_task_switch") return "Focus 전환 확인 이후";
  if (decisionType === "morning_override") return "Morning 계획의 중요한 우선순위를 바꿀 때";
  return "중요한 일정 변경에서";
};

const choiceText = (action: string): string => ({
  approve: "Amber 제안을 승인하는 선택",
  reject: "Amber 제안을 거절하는 선택",
  exclude_tasks: "제안된 Task를 제외하는 선택",
  switch_task: "현재 Task에서 전환하는 선택"
}[action] ?? `“${action}” 선택`);

const signalText = (kind: "reason" | "outcome", value: string): string => {
  const labels: Record<string, string> = {
    deadline_priority: "마감 우선 이유",
    routine_priority: "루틴 우선 이유",
    fatigue: "피로 이유",
    focus_difficulty: "집중 어려움 이유",
    schedule_conflict: "일정 충돌 이유",
    task_blocked: "Task BLOCKED 결과",
    task_completed: "Task DONE 결과",
    below_planned_time: "계획보다 적은 실제 집중시간",
    above_planned_time: "계획보다 많은 실제 집중시간",
    matched_planned_time: "계획과 같은 실제 집중시간"
  };
  return `${labels[value] ?? value}${kind === "reason" ? "가 공통됨" : "가 반복됨"}`;
};

const confidence = (evidence: readonly PatternLearningCase[]): number => {
  const outcomes = evidence.map((item) => outcomeType(item.observedOutcome)).filter((value): value is string => value !== null);
  const dominantOutcome = outcomes.length === 0 ? 0 : Math.max(...[...new Set(outcomes)].map((value) => outcomes.filter((item) => item === value).length)) / evidence.length;
  return Math.min(0.95, Number((0.45 + Math.min(evidence.length, 8) * 0.05 + 0.15 + dominantOutcome * 0.1).toFixed(2)));
};

export const derivePatternCandidates = (cases: readonly PatternLearningCase[]): PatternCandidate[] => {
  const bases = new Map<string, PatternLearningCase[]>();
  for (const item of cases) {
    const action = typeof item.userChoice.action === "string" ? item.userChoice.action : null;
    const situation = situationType(item);
    if (!action || situation === "unspecified") continue;
    const key = `${item.decisionType}|${situation}|${action}`;
    bases.set(key, [...(bases.get(key) ?? []), item]);
  }
  const candidates: PatternCandidate[] = [];
  for (const [base, items] of bases) {
    const [decisionType, situation, action] = base.split("|") as [string, string, string];
    const reasonGroups = new Map<string, PatternLearningCase[]>();
    for (const item of items) {
      const reason = reasonType(item.userReason);
      if (reason) reasonGroups.set(reason, [...(reasonGroups.get(reason) ?? []), item]);
    }
    const reasonCaseIds = new Set<string>();
    const qualifyingReasons = [...reasonGroups.entries()].filter(([, evidence]) => evidence.length >= MIN_PATTERN_EVIDENCE);
    for (const [, evidence] of qualifyingReasons) evidence.forEach((item) => reasonCaseIds.add(item.id));
    const groups: Array<["reason" | "outcome", string, PatternLearningCase[]]> = qualifyingReasons
      .map(([value, evidence]): ["reason", string, PatternLearningCase[]] => ["reason", value, evidence]);
    const outcomeGroups = new Map<string, PatternLearningCase[]>();
    for (const item of items.filter((entry) => !reasonCaseIds.has(entry.id))) {
      const outcome = outcomeType(item.observedOutcome);
      if (outcome) outcomeGroups.set(outcome, [...(outcomeGroups.get(outcome) ?? []), item]);
    }
    groups.push(...[...outcomeGroups.entries()]
      .filter(([, evidence]) => evidence.length >= MIN_PATTERN_EVIDENCE)
      .map(([value, evidence]): ["outcome", string, PatternLearningCase[]] => ["outcome", value, evidence]));
    for (const [kind, value, evidence] of groups) {
      if(decisionType.startsWith("execution_") && new Set(evidence.map(e=>e.observedOutcome.date)).size < MIN_PATTERN_EVIDENCE) continue;
      if(decisionType === "execution_estimate" && new Set(evidence.map(e=>e.observedOutcome.taskId)).size < MIN_PATTERN_EVIDENCE) continue;
      candidates.push({
        signature: `${PATTERN_EVALUATOR_VERSION}:${base}|${kind}:${value}`,
        decisionType,
        situationType: situation,
        choiceAction: action,
        consistencyKind: kind,
        consistencyValue: value,
        observedBehavior: decisionType.startsWith("execution_")
          ? `${situation} 범위에서 ${value} 관찰 ${evidence.length}건; 원인이나 성향은 미확정`
          : `${contextText(decisionType, situation)} ${choiceText(action)}이 반복됨 (${signalText(kind, value)})`,
        evidence: [...evidence].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime()),
        confidence: confidence(evidence)
      });
    }
  }
  return candidates.sort((a, b) => a.signature.localeCompare(b.signature));
};
