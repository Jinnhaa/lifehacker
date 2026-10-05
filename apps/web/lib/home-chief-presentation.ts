import type { ActionCandidate, ChiefPriorityDecision, OutcomeJudgment } from "@amber/core";
import type { HomeChiefQuest, HomeReassurance, HomeViewModel } from "./home-types";

type Choice = OutcomeJudgment["todayPriority"][number];
export interface HomeTaskDetails {
  readonly id: string;
  readonly title: string;
  readonly context: string | null;
  readonly completionCriteria: string | null;
  readonly scopeExclusions: string | null;
  readonly stepId?: string | null;
  readonly planItemId?: string | null;
}

export function mapHomeChiefPriority(
  decision: ChiefPriorityDecision,
  candidates: readonly ActionCandidate[],
  tasks: readonly HomeTaskDetails[]
): {
  currentAction: HomeViewModel["currentAction"];
  nextQuests: readonly HomeChiefQuest[];
  reassurance: readonly HomeReassurance[];
} {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.taskId, candidate]));
  const detailsById = new Map(tasks.map((task) => [task.id, task]));
  const mainCandidate = decision.mainQuest ? candidatesById.get(decision.mainQuest.taskId) : null;
  const mainDetails = decision.mainQuest ? detailsById.get(decision.mainQuest.taskId) : null;
  const currentAction: HomeViewModel["currentAction"] = decision.mainQuest && mainCandidate ? {
    kind: "task",
    taskId: decision.mainQuest.taskId,
    stepId: mainDetails?.stepId ?? null,
    occurrenceId: null,
    planItemId: mainDetails?.planItemId ?? null,
    title: decision.mainQuest.title,
    minutes: mainCandidate.remainingMinutes ?? mainCandidate.estimatedMinutes,
    context: mainCandidate.contextTitle,
    source: "chief_priority",
    whyNow: decision.mainQuest.whyNow,
    completionCriteria: mainCandidate.completionCriteria,
    scopeExclusions: mainDetails?.scopeExclusions ?? null,
    candidateSource: "task",
    reasonCodes: decision.mainQuest.reasonCodes,
    relevantDeadline: decision.mainQuest.evidence.deadlineDate,
    selectedPolicyName: null
  } : null;
  const nextQuests = decision.upNext.slice(0, 2).flatMap((choice): HomeChiefQuest[] => {
    const candidate = candidatesById.get(choice.taskId);
    if (!candidate) return [];
    return [{
      taskId: choice.taskId,
      title: choice.title,
      context: candidate.contextTitle,
      minutes: candidate.remainingMinutes ?? candidate.estimatedMinutes,
      whyNow: choice.whyNow,
      candidateSource: "task",
      contextId: candidate.contextId,
      completionCriteria: candidate.completionCriteria
    }];
  });
  return { currentAction, nextQuests, reassurance: [] };
}

const reasonLabels: Partial<Record<Choice["reasonCodes"][number], string>> = {
  OVERDUE:"마감이 지났어요",DUE_TODAY:"오늘 공식 마감",INTERNAL_DEADLINE:"내부 목표일이 가까워요",
  UNBLOCKS:"팀 작업을 먼저 넘겨야 해요",FUTURE_CAPACITY_DEFICIT:"나중에 할 시간이 부족해요",FUTURE_CAPACITY_UNKNOWN:"이후 가용시간은 확인이 필요해요",
  REQUIRED_COMMITMENT:"필수 약속",WEEKLY_FOCUS:"이번 주 Focus",MONTHLY_FOCUS:"이번 달 Goal",CUMULATIVE_PROTECTION:"누적 학습을 지금 보호해야 해요",
  ACTIVE_FOCUS:"현재 집중을 이어가요",CONTINUITY:"진행하던 일을 이어가요",CAPACITY_UNKNOWN:"현재 가용시간은 확인 전이에요",
  COMMITMENT:"확인한 약속",IMPORTANT:"중요한 업무",STRATEGIC_IMPORTANCE:"사용자가 정한 전략 중요도",REVIEW_NEXT:"다음 사용자 검토를 준비해요",
  LEARNING_PROPOSAL:"Learning이 실행 범위를 확정했어요",LEARNING_SCHEDULE_RISK:"평가 일정까지 여유가 부족해요",LEARNING_SLACK:"평가 일정 전 여유가 확인됐어요"
};
// Presentation emphasis only; candidate ordering always comes unchanged from Chief.
export function homeChiefReason(codes: Choice["reasonCodes"]): string {
  const urgent = codes.filter(code=>["OVERDUE","DUE_TODAY","UNBLOCKS","FUTURE_CAPACITY_DEFICIT","LEARNING_SCHEDULE_RISK","CUMULATIVE_PROTECTION"].includes(code));
  const rest = codes.filter(code=>!urgent.includes(code));
  return [...urgent,...rest].flatMap(code=>reasonLabels[code] ? [reasonLabels[code]!] : []).slice(0,2).join(" · ") || "Chief가 현재 근거에서 추천했어요";
}
export function mapHomeChief(judgment: OutcomeJudgment, tasks: readonly HomeTaskDetails[]): {
  currentAction: HomeViewModel["currentAction"]; nextQuests: readonly HomeChiefQuest[]; reassurance: readonly HomeReassurance[];
} {
  const ordered = [...judgment.todayPriority,...(judgment.futureRelief ? [judgment.futureRelief] : []),...judgment.notToday];
  const details = new Map(tasks.map(task=>[task.id,task]));
  const mission = judgment.currentMission;
  const choice = mission?.taskId ? ordered.find(choice=>choice.taskId===mission.taskId) : null;
  const task = choice ? details.get(choice.taskId) : null;
  const currentAction: HomeViewModel["currentAction"] = choice && task ? {
    kind:"task",taskId:choice.taskId,title:choice.exactScope ?? task.title,minutes:choice.minutes,context:choice.contextTitle ?? task.context,source:mission!.source,
    planItemId:task.planItemId ?? null,stepId:task.stepId ?? null,occurrenceId:null,whyNow:homeChiefReason(choice.reasonCodes),
    completionCriteria:choice.completionCriteria ?? task.completionCriteria,scopeExclusions:task.scopeExclusions,
    candidateSource:choice.candidateSource,reasonCodes:choice.reasonCodes,relevantDeadline:choice.relevantDeadline,
    selectedPolicyName:choice.selectedPolicyName
  } : null;
  const remaining = ordered.filter(choice=>choice.taskId!==currentAction?.taskId);
  const nextQuests = remaining.filter(choice=>judgment.eligibleTaskIds.includes(choice.taskId)).slice(0,2).map(choice=>({
    taskId:choice.taskId,title:choice.exactScope ?? details.get(choice.taskId)?.title ?? choice.outcome,context:choice.contextTitle ?? details.get(choice.taskId)?.context ?? null,
    minutes:choice.minutes,whyNow:homeChiefReason(choice.reasonCodes),candidateSource:choice.candidateSource,
    contextId:choice.contextId,completionCriteria:choice.completionCriteria ?? null
  }));
  const reassurance = remaining.filter(choice=>choice.reasonCodes.some(code=>["REQUIRED_COMMITMENT","COMMITMENT","IMPORTANT","GOAL","WEEKLY_FOCUS","MONTHLY_FOCUS","CUMULATIVE_PROTECTION","FUTURE_CAPACITY_DEFICIT","FUTURE_CAPACITY_UNKNOWN","OVERDUE","DUE_TODAY","UNKNOWN_EFFORT","LEARNING_SLACK","LEARNING_SCHEDULE_RISK"].includes(code))).slice(0,3).map(choice=>{
    let status: HomeReassurance["status"] = "uncertain";
    let explanation = "유예해도 괜찮은지는 아직 확인되지 않았어요";
    if (choice.reasonCodes.includes("FUTURE_CAPACITY_DEFICIT") || (choice.capacityWindowSlackMinutes !== null && choice.capacityWindowSlackMinutes !== undefined && choice.capacityWindowSlackMinutes < 0)) {
      status="constrained";explanation="마감일까지 알려진 가용시간이 부족해요";
    } else if (choice.learningJudgmentState === "NEEDS_REVIEW" || choice.reasonCodes.some(code=>["UNKNOWN_EFFORT","FUTURE_CAPACITY_UNKNOWN"].includes(code))) {
      explanation=choice.reasonCodes.includes("UNKNOWN_EFFORT") ? "필요한 분량이 미정이라 유예 안전성을 확인할 수 없어요" : "이후 가용시간이 미정이라 유예 안전성을 확인할 수 없어요";
    } else if (choice.reasonCodes.some(code=>["BLOCKED","OVERDUE","DUE_TODAY","DEADLINE_RISK"].includes(code))) {
      status="constrained";explanation=choice.reasonCodes.includes("BLOCKED") ? "선행 작업 또는 확인이 남아 있어요" : "마감 근거를 다시 확인해야 해요";
    } else if (choice.forecastSlackDays !== null && choice.forecastSlackDays > 0) {
      status="safe";explanation=`예상 완료일과 평가 일정 사이 ${choice.forecastSlackDays}일 여유가 있어요`;
    } else if (choice.capacityWindowSlackMinutes !== null && choice.capacityWindowSlackMinutes !== undefined && choice.capacityWindowSlackMinutes > 0) {
      status="safe";explanation=`확인된 마감 window에 ${choice.capacityWindowSlackMinutes}분 여유가 있어요`;
    } else if (judgment.selectedTaskIds.includes(choice.taskId) && choice.reasonCodes.includes("SCHEDULE_FIT")) {
      status="protected";explanation=`오늘 추천 분량 ${choice.minutes}분이 확인된 가용시간에 들어가요`;
    }
    return {taskId:choice.taskId,title:choice.exactScope ?? details.get(choice.taskId)?.title ?? choice.outcome,status,explanation,
      whyNotNow:choice.reasonCodes.includes("BLOCKED") ? "선행 조건 대기" : judgment.selectedTaskIds.includes(choice.taskId) ? "현재 Quest 다음 순서" : "현재 Chief 선택에서 뒤에 둠",
      candidateSource:choice.candidateSource,context:choice.contextTitle ?? details.get(choice.taskId)?.context ?? null,
      riskTrigger:choice.relevantDeadline};
  });
  return {currentAction,nextQuests,reassurance};
}

export const canStartHomeQuest = (data: Pick<HomeViewModel,"configured"|"currentAction"|"focus">): boolean =>
  data.configured && data.focus===null && data.currentAction?.kind==="task" && Boolean(data.currentAction.taskId);
export const homeFocusMatchesRecommendation = (data: Pick<HomeViewModel,"currentAction"|"focus">): boolean =>
  Boolean(data.focus?.step==="active" && data.currentAction?.taskId && data.focus.taskId===data.currentAction.taskId);
