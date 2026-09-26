import { createHash } from "node:crypto";
import { z } from "zod";
import { getDaysUntilDeadline } from "../rules/deadline.js";
import { calculateTaskWorkload, mergeIntervals } from "../morning/morning-planner.js";
import { zonedDateTimeToUtc } from "@amber/shared";
import { projectFutureCapacity, type FutureCapacityProjection } from "../future-capacity/future-capacity.js";
import type { LearningUnit } from "../learning/learning-unit.js";
import type { MorningObservation, TimeInterval } from "../morning/morning.js";

export interface OutcomeEvidence {
  dependencies: { taskId: string; prerequisiteTaskId: string; completed: boolean }[];
  steps: { id: string; taskId: string; position: number; owner: string; status: string; reviewOfStepId: string | null }[];
  objectives: { id: string; title: string; goalId: string | null; importance: number; status: string }[];
  goals: { id: string; title: string; importance: number; status: string; level?: string; periodStart?: string | null; periodEnd?: string | null }[];
  contexts?: { id: string; commitmentLevel: "REQUIRED" | "IMPORTANT" | "OPTIONAL" | null; strategicImportance: number | null; studyMode: "CUMULATIVE" | "MIXED" | "CRAMMABLE" | null; examDate: string | null }[];
  learningUnits?: readonly LearningUnit[];
  capacityConstraints?: readonly (TimeInterval & { blocksCapacity: boolean })[];
  artifacts: { id: string; taskId: string | null; workContextId: string | null; type: string; reviewStatus: string | null; hash: string | null }[];
  approvedPlan: { id: string; revisionNo: number } | null;
  activeFocusTaskId: string | null;
  activeFocus?: { taskId: string | null; occurrenceId: string | null; title: string } | null;
  approvedAction: { taskId: string | null; title: string; startsAt: string; endsAt: string } | null;
  completedTodayCount?: number;
  plannedTodayTaskIds?: string[];
  focusEvidence?: { workContextId: string; completedSessions: number; actualMinutes: number }[];
}

export const reasonCodeSchema = z.enum(["OVERDUE", "DUE_TODAY", "INTERNAL_DEADLINE", "ASSESSMENT_RISK", "WEEKLY_GAP", "DEADLINE_RISK", "COMMITMENT", "IMPORTANT", "GOAL", "UNBLOCKS", "REVIEW_NEXT", "CONTINUITY", "SCHEDULE_FIT", "BLOCKED", "CAPACITY", "UNKNOWN_EFFORT", "NOT_SELECTED", "ACTIVE_FOCUS", "APPROVED_PLAN", "CARRYOVER", "ESTIMATE_HISTORY", "BLOCKER_HISTORY", "USER_FEEDBACK", "FUTURE_CAPACITY_DEFICIT", "FUTURE_CAPACITY_UNKNOWN", "REQUIRED_COMMITMENT", "WEEKLY_FOCUS", "MONTHLY_FOCUS", "STRATEGIC_IMPORTANCE", "CUMULATIVE_PROTECTION", "OPTIONAL_YIELDS", "CAPACITY_UNKNOWN", "LEARNING_STATE"]);
const choiceSchema = z.object({ taskId: z.string(), outcome: z.string(), reasonCodes: z.array(reasonCodeSchema).min(1), rationale: z.string(), evidenceRefs: z.array(z.string()), minutes: z.number().nonnegative(), completionCriteria: z.string().nullable().optional() });
export const outcomeJudgmentSchema = z.object({
  version: z.literal("chief-outcome-v1"),
  todayPriority: z.array(choiceSchema).max(3), futureRelief: choiceSchema.nullable(),
  notToday: z.array(choiceSchema), risks: z.array(choiceSchema),
  currentMission: z.object({ taskId: z.string().nullable(), title: z.string(), source: z.enum(["focus_session", "plan_item", "chief_recommendation"]), reasonCodes: z.array(reasonCodeSchema).min(1) }).nullable(),
  selectedTaskIds: z.array(z.string()), eligibleTaskIds: z.array(z.string()),
  approvedPlan: z.object({ id: z.string(), revisionNo: z.number() }).nullable(),
  contextRefs: z.array(z.string()).optional(),
  capacityKnown: z.boolean(),
  capacityConflicts: z.array(z.object({ startDate: z.string(), endDate: z.string(), availableMinutes: z.number(), knownRequiredWorkMinutes: z.number(), taskIds: z.array(z.string()) })).default([])
});
export type OutcomeJudgment = z.infer<typeof outcomeJudgmentSchema>;
type Choice = z.infer<typeof choiceSchema>;
export interface OutcomeInput { observation: MorningObservation; now: Date; workUntil: Date | null; privateIntervals: readonly TimeInterval[]; localWeekday: number; currentCapacityMinutes?: number | null; futureCapacity?: FutureCapacityProjection }

export const outcomeLocalDate = (now: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};
export function outcomeInputFromObservation(observation: MorningObservation, now: Date): OutcomeInput {
  const configured = observation.planningPolicy.defaultWorkUntil ?? observation.planningPolicy.workUntil;
  const date = outcomeLocalDate(now, observation.timeZone);
  const workUntil = typeof configured === "string" && /^\d{2}:\d{2}$/.test(configured) ? zonedDateTimeToUtc(`${date}T${configured}:00`, observation.timeZone) : null;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { observation, now, workUntil, privateIntervals: [], localWeekday: weekday || 7 };
}
export function outcomeAvailableMinutes(input: OutcomeInput): number | null {
  if (input.currentCapacityMinutes !== undefined) return input.currentCapacityMinutes;
  if (!input.workUntil) return null;
  const gross = Math.max(0, (input.workUntil.getTime() - input.now.getTime()) / 60_000);
  const occupied = mergeIntervals([...input.observation.constraints.filter(c => c.blocksCapacity), ...input.privateIntervals], { start: input.now, end: input.workUntil });
  return Math.max(0, Math.floor(gross - occupied.reduce((sum, interval) => sum + (interval.end.getTime() - interval.start.getTime()) / 60_000, 0) - input.observation.planningBufferMinutes));
}
export function projectOutcomeCapacity(input: OutcomeInput): FutureCapacityProjection {
  if (input.futureCapacity) return input.futureCapacity;
  const startDate = outcomeLocalDate(input.now, input.observation.timeZone);
  const tasks = input.observation.tasks.map(task => {
    const examDate = input.observation.outcomeEvidence?.contexts?.find(c => c.id === task.workContextId)?.examDate;
    return !task.officialDeadline && !task.internalDeadline && examDate ? { ...task, officialDeadline: zonedDateTimeToUtc(`${examDate}T23:59:59`, input.observation.timeZone) } : task;
  });
  const dates = tasks.flatMap(task => [task.internalDeadline, task.officialDeadline].flatMap(date => date ? [outcomeLocalDate(date, input.observation.timeZone)] : []));
  const endDate = [startDate, ...dates].sort().at(-1)!;
  return projectFutureCapacity({ startDate, endDate, timeZone: input.observation.timeZone, now: input.now,
    dailyAvailability: input.workUntil ? { [startDate]: [{ start: input.now, end: new Date(Math.max(input.now.getTime(), input.workUntil.getTime())) }] } : {},
    constraints: [...(input.observation.outcomeEvidence?.capacityConstraints ?? input.observation.constraints), ...input.privateIntervals.map(interval => ({ ...interval, blocksCapacity: true }))],
    planningBufferMinutes: input.observation.planningBufferMinutes, tasks });
}

const labels: Record<z.infer<typeof reasonCodeSchema>, string> = {
  FUTURE_CAPACITY_DEFICIT: "마감일까지 알려진 수요가 가용시간을 초과합니다", FUTURE_CAPACITY_UNKNOWN: "미래 가용시간 또는 필요한 분량이 미정이라 안전한 유예를 보장할 수 없습니다",
  REQUIRED_COMMITMENT: "필수 commitment입니다", WEEKLY_FOCUS: "현재 Weekly Focus에 연결됩니다", MONTHLY_FOCUS: "현재 Monthly Goal에 연결됩니다",
  STRATEGIC_IMPORTANCE: "사용자가 정한 전략 중요도를 비교합니다", CUMULATIVE_PROTECTION: "마감 수요와 용량 부족 근거로 누적 학습을 보호합니다",
  OPTIONAL_YIELDS: "더 강한 필수/중요 업무를 보호하기 위해 optional 업무를 뒤로 둡니다", CAPACITY_UNKNOWN: "현재 가용시간을 확인해야 합니다", LEARNING_STATE: "사용자가 기록한 독립 학습 상태를 근거로 보존합니다",
  CARRYOVER: "이전 Day Close에서 미완료로 확인되어 다시 검토합니다",
  ESTIMATE_HISTORY: "같은 작업 범위의 소요시간 오차가 여러 날 관찰되어 예상시간 확인이 필요합니다",
  BLOCKER_HISTORY: "같은 작업 범위의 막힘이 여러 날 관찰되어 시작 전 준비를 확인합니다",
  USER_FEEDBACK: "이 Task에 대한 이전 사용자 판단 이유를 함께 검토합니다",
  DEADLINE_RISK: "오늘 필요한 작업량을 확인된 가용시간에 배치할 수 없습니다",
  OVERDUE: "마감이 지났습니다", DUE_TODAY: "오늘 마감입니다", COMMITMENT: "명시적으로 승인한 약속입니다",
  INTERNAL_DEADLINE: "내부 목표일이 가깝습니다", ASSESSMENT_RISK: "가까운 평가 준비가 부족합니다", WEEKLY_GAP: "이번 주 학습 목표가 부족합니다",
  IMPORTANT: "중요도가 높은 일입니다", GOAL: "활성 목표에 연결됩니다", UNBLOCKS: "실제 후속 Task의 선행 조건입니다",
  REVIEW_NEXT: "다음 단계가 명시된 사용자 검토입니다", CONTINUITY: "이미 진행하던 일입니다", SCHEDULE_FIT: "남은 가용시간에 완료 분량이 들어갑니다",
  BLOCKED: "선행 작업 또는 검토가 아직 남아 있습니다", CAPACITY: "확인된 가용시간에 완료 분량이 들어가지 않습니다",
  UNKNOWN_EFFORT: "완료에 필요한 시간을 확인해야 합니다", NOT_SELECTED: "오늘 핵심 결과보다 뒤에 두었습니다",
  ACTIVE_FOCUS: "현재 집중을 유지합니다", APPROVED_PLAN: "승인한 계획을 유지합니다"
};

export function judgeOutcomes(input: OutcomeInput): OutcomeJudgment {
  const { observation, now } = input;
  const evidence = observation.outcomeEvidence;
  const capacity = projectOutcomeCapacity(input);
  const currentCapacity = outcomeAvailableMinutes(input);
  const todayDate = outcomeLocalDate(now, observation.timeZone);
  const candidates = observation.tasks.filter(t => ["INBOX", "PLANNED", "IN_PROGRESS", "BLOCKED", "WAITING_FOR_USER"].includes(t.status));
  const blocked = new Set(candidates.filter(t => ["BLOCKED", "WAITING_FOR_USER"].includes(t.status)).map(t => t.id as string));
  for (const edge of evidence?.dependencies ?? []) if (!edge.completed) blocked.add(edge.taskId);
  for (const task of candidates) {
    const first = evidence?.steps.filter(s => s.taskId === task.id && !["completed", "skipped"].includes(s.status)).sort((a,b) => a.position-b.position)[0];
    if (first && ["dependency_waiting", "waiting_for_review", "blocked"].includes(first.status)) blocked.add(task.id);
  }
  const choices = candidates.map(task => {
    const codes: Choice["reasonCodes"] = [];
    const refs = [`task:${task.id}`];
    const context = evidence?.contexts?.find(c => c.id === task.workContextId);
    if (context) refs.push(`work-context:${context.id}`);
    if (context?.commitmentLevel === "REQUIRED") codes.push("REQUIRED_COMMITMENT");
    if (context?.strategicImportance !== null && context?.strategicImportance !== undefined) codes.push("STRATEGIC_IMPORTANCE");
    const windows = capacity.deadlineWindows.filter(window => window.requiredTaskIds.includes(task.id));
    const deficit = windows.some(window => window.availableMinutes !== null && window.knownRequiredWorkMinutes > window.availableMinutes);
    if (deficit) codes.push("FUTURE_CAPACITY_DEFICIT");
    else if (windows.some(window => window.slackMinutes === null) || (!windows.length && (task.officialDeadline || task.internalDeadline || context?.examDate))) codes.push("FUTURE_CAPACITY_UNKNOWN");
    refs.push(...windows.map(window => `capacity-window:${window.startDate}:${window.endDate}`));
    if (context?.studyMode === "CUMULATIVE" && deficit && context.commitmentLevel !== "OPTIONAL") codes.push("CUMULATIVE_PROTECTION");
    const units = evidence?.learningUnits?.filter(unit => unit.workContextId === task.workContextId) ?? [];
    if (units.length) { codes.push("LEARNING_STATE"); refs.push(...units.map(unit => `learning-unit:${unit.id}:${unit.exposureState}:${unit.understandingState}:${unit.validationState}`)); }
    if(observation.carryoverContext?.taskIds.includes(task.id)) { codes.push("CARRYOVER"); refs.push(`day-close:${observation.carryoverContext.sourceDate}`); }
    for(const p of observation.learningContext?.patterns ?? []) if(p.scope===task.workContextId || p.scope===`task:${task.id}`) {
      codes.push(["underestimated","overestimated","matched"].includes(p.signal) ? "ESTIMATE_HISTORY" : "BLOCKER_HISTORY"); refs.push(`pattern:${p.id}`);
    }
    for(const f of observation.learningContext?.feedback ?? []) if(f.taskIds.includes(task.id) && f.reason) { codes.push("USER_FEEDBACK"); refs.push(`decision-feedback:${f.id}`); }
    const workload = calculateTaskWorkload(task, now, observation.timeZone, input.localWeekday);
    const officialDays = getDaysUntilDeadline(task.officialDeadline, now, observation.timeZone);
    const internalDays = getDaysUntilDeadline(task.internalDeadline, now, observation.timeZone);
    if (task.officialDeadline && task.officialDeadline < now) codes.push("OVERDUE");
    else if (officialDays === 0) codes.push("DUE_TODAY");
    if (internalDays !== null && internalDays <= 3) codes.push("INTERNAL_DEADLINE");
    for (const directive of observation.strategicDirectives) {
      const contains = (v: unknown): boolean => v === task.id || (Array.isArray(v) ? v.some(contains) : !!v && typeof v === "object" && Object.values(v).some(contains));
      if (contains(directive.priorityOrder)) { codes.push("COMMITMENT"); refs.push(`directive:${directive.id}`); }
    }
    if (task.importance >= 4) codes.push("IMPORTANT");
    const objective = evidence?.objectives.find(o=>o.id===task.objectiveId && o.status === "active");
    if (objective) { codes.push("GOAL"); refs.push(`objective:${objective.id}`); if (objective.goalId) refs.push(`goal:${objective.goalId}`); }
    const goal = evidence?.goals.find(goal => goal.id === objective?.goalId && goal.status === "active"
      && (!goal.periodStart || goal.periodStart <= todayDate) && (!goal.periodEnd || goal.periodEnd >= todayDate));
    if (goal?.level === "WEEKLY") codes.push("WEEKLY_FOCUS");
    else if (goal?.level === "MONTHLY") codes.push("MONTHLY_FOCUS");
    const downstream = evidence?.dependencies.filter(d=>d.prerequisiteTaskId===task.id && !d.completed) ?? [];
    if (downstream.length) { codes.push("UNBLOCKS"); refs.push(...downstream.map(d=>`dependency:${d.taskId}:${task.id}`)); }
    const steps = evidence?.steps.filter(s=>s.taskId===task.id && !["completed", "skipped"].includes(s.status)).sort((a,b)=>a.position-b.position) ?? [];
    if (steps[0] && steps[1]?.owner === "user" && steps[1].reviewOfStepId === steps[0].id) { codes.push("REVIEW_NEXT"); refs.push(`step:${steps[1].id}`); }
    if (task.status === "IN_PROGRESS" || task.actualMinutes > 0) codes.push("CONTINUITY");
    if (evidence?.activeFocusTaskId === task.id) codes.push("ACTIVE_FOCUS");
    refs.push(...(evidence?.artifacts.filter(a=>a.taskId===task.id || (task.workContextId && a.workContextId===task.workContextId)).map(a=>`artifact:${a.id}`) ?? []));
    const estimate = task.estimatedUserMinutes ?? task.estimatedMinutes;
    const minutes = estimate === null ? 0 : workload.todayRequiredMinutes;
    if (blocked.has(task.id)) codes.push("BLOCKED");
    if (!minutes) codes.push("UNKNOWN_EFFORT");
    const seriousDependency = downstream.some(edge => {
      const dependent = observation.tasks.find(candidate => candidate.id === edge.taskId);
      return evidence?.contexts?.find(c => c.id === dependent?.workContextId)?.commitmentLevel === "REQUIRED";
    });
    return { taskId: task.id as string, outcome: task.completionCriteria || task.title, completionCriteria: task.completionCriteria, reasonCodes: [...new Set(codes)], rationale: "", evidenceRefs: refs, minutes, deadline: task.officialDeadline?.getTime() ?? task.internalDeadline?.getTime() ?? Infinity, importance: task.importance, unlocks: downstream.length,
      commitment: context?.commitmentLevel ?? null, strategicImportance: context?.strategicImportance ?? null, studyMode: context?.studyMode ?? null, seriousDependency };
  });
  // Ordered policy bands, not a weighted score. Calendar only validates fit.
  const band = (c: typeof choices[number]) => c.reasonCodes.includes("OVERDUE") || c.reasonCodes.includes("DUE_TODAY") ? 0
    : c.seriousDependency ? 1 : c.reasonCodes.includes("FUTURE_CAPACITY_DEFICIT") && c.commitment !== "OPTIONAL" ? 1
    : c.reasonCodes.includes("COMMITMENT") || c.reasonCodes.includes("INTERNAL_DEADLINE") || (c.reasonCodes.includes("CARRYOVER") && c.importance >= 4) ? 2
      : c.reasonCodes.includes("IMPORTANT") || c.reasonCodes.includes("GOAL") ? 3
        : c.reasonCodes.includes("UNBLOCKS") ? 4 : 5;
  const commitmentOrder = (value: typeof choices[number]) => value.commitment === "REQUIRED" ? 0 : value.commitment === "IMPORTANT" ? 1 : value.commitment === "OPTIONAL" ? 3 : 2;
  const focusOrder = (value: typeof choices[number]) => value.reasonCodes.includes("WEEKLY_FOCUS") ? 0 : value.reasonCodes.includes("MONTHLY_FOCUS") ? 1 : 2;
  const protectedWork = choices.some(c => !blocked.has(c.taskId) && c.commitment !== "OPTIONAL" && (band(c) <= 1 || c.commitment === "REQUIRED"));
  for (const c of choices) if (c.commitment === "OPTIONAL" && protectedWork) c.reasonCodes.push("OPTIONAL_YIELDS");
  // Lexicographic evidence comparisons; no summed/global score. Quick-close is only a final tie-break.
  choices.sort((a,b)=>band(a)-band(b) || (band(a) === 0 ? a.deadline-b.deadline : 0) || Number(b.seriousDependency)-Number(a.seriousDependency) || commitmentOrder(a)-commitmentOrder(b) || focusOrder(a)-focusOrder(b)
    || (b.strategicImportance ?? -1)-(a.strategicImportance ?? -1) || a.deadline-b.deadline
    || Number(b.reasonCodes.includes("CUMULATIVE_PROTECTION"))-Number(a.reasonCodes.includes("CUMULATIVE_PROTECTION"))
    || Number(b.studyMode === "MIXED" && b.reasonCodes.includes("FUTURE_CAPACITY_DEFICIT"))-Number(a.studyMode === "MIXED" && a.reasonCodes.includes("FUTURE_CAPACITY_DEFICIT"))
    || b.unlocks-a.unlocks || b.importance-a.importance || Number(b.reasonCodes.includes("ACTIVE_FOCUS"))-Number(a.reasonCodes.includes("ACTIVE_FOCUS"))
    || Number(b.reasonCodes.includes("CONTINUITY"))-Number(a.reasonCodes.includes("CONTINUITY")) || a.minutes-b.minutes || a.taskId.localeCompare(b.taskId));
  const eligible = choices.filter(c=>!blocked.has(c.taskId) && c.minutes > 0);
  const selected: typeof choices = [];
  const fit = (next: typeof choices[number]): boolean => {
    if (currentCapacity === null) return selected.length === 0;
    return [...selected, next].reduce((sum, choice) => sum + choice.minutes, 0) <= currentCapacity;
  };
  // Relief has a distinct evidence requirement; urgent/committed outcomes keep first claim.
  const reliefCandidates = eligible.filter(c=>band(c)>2 && (c.reasonCodes.includes("UNBLOCKS") || c.reasonCodes.includes("REVIEW_NEXT")));
  for (const choice of eligible) {
    if (selected.length === 3) break;
    if (choice.commitment === "OPTIONAL" && choices.some(c => !blocked.has(c.taskId) && c.commitment !== "OPTIONAL" && band(c) <= 1 && !selected.includes(c))) continue;
    if (fit(choice)) selected.push(choice);
  }
  const today = [...selected];
  let relief: typeof choices[number] | null = null;
  for (const c of reliefCandidates) if (!selected.includes(c) && fit(c)
    && !(c.commitment === "OPTIONAL" && choices.some(other => !blocked.has(other.taskId) && other.commitment !== "OPTIONAL" && band(other) <= 1 && !selected.includes(other)))) { relief=c; selected.push(c); break; }
  const finish = (c: typeof choices[number], extra: Choice["reasonCodes"][number]): Choice => {
    const reasonCodes = [...new Set([...c.reasonCodes, extra])];
    return { taskId:c.taskId, outcome:c.outcome, completionCriteria:c.completionCriteria, minutes:c.minutes, evidenceRefs:c.evidenceRefs, reasonCodes, rationale:reasonCodes.map(code=>labels[code]).join(". ") + "." };
  };
  const notToday = choices.filter(c=>!selected.includes(c)).map(c => {
    const capacityMiss = !blocked.has(c.taskId) && c.minutes > 0 && !fit(c);
    const result = finish(c, blocked.has(c.taskId) ? "BLOCKED" : !c.minutes ? "UNKNOWN_EFFORT" : capacityMiss ? "CAPACITY" : "NOT_SELECTED");
    if (!capacityMiss || !Number.isFinite(c.deadline)) return result;
    const reasonCodes = [...new Set([...result.reasonCodes, "DEADLINE_RISK" as const])];
    return { ...result, reasonCodes, rationale: reasonCodes.map(code=>labels[code]).join(". ") + "." };
  });
  let currentMission: OutcomeJudgment["currentMission"] = null;
  const focusTask = candidates.find(t=>t.id===evidence?.activeFocusTaskId);
  if (focusTask && selected[0]?.taskId === focusTask.id) currentMission={ taskId:focusTask.id,title:focusTask.title,source:"focus_session",reasonCodes:selected[0].reasonCodes };
  else {
    const occupied = observation.constraints.some(c=>c.blocksCapacity && c.start<=now && c.end>now) || input.privateIntervals.some(c=>c.start<=now && c.end>now);
    const action = evidence?.approvedAction;
    const actionChoice = action?.taskId ? eligible.find((choice) => choice.taskId === action.taskId) : null;
    const top = selected[0];
    if (!occupied && top && (!actionChoice || top.taskId !== actionChoice.taskId)) currentMission={taskId:top.taskId,title:top.outcome,source:"chief_recommendation",reasonCodes:finish(top,currentCapacity === null ? "CAPACITY_UNKNOWN" : "SCHEDULE_FIT").reasonCodes};
    else if (!occupied && action && new Date(action.startsAt)<=now && new Date(action.endsAt)>now && (!action.taskId || actionChoice)) currentMission={ taskId:action.taskId,title:action.title,source:"plan_item",reasonCodes:["APPROVED_PLAN"] };
    else if (!occupied && top) currentMission={taskId:top.taskId,title:top.outcome,source:"chief_recommendation",reasonCodes:finish(top,currentCapacity === null ? "CAPACITY_UNKNOWN" : "SCHEDULE_FIT").reasonCodes};
  }
  return outcomeJudgmentSchema.parse({ contextRefs:observation.learningContext?.workstyle.map(p=>`workstyle:${p.id}:v${p.revision}`) ?? [], version:"chief-outcome-v1",todayPriority:today.map(c=>finish(c,currentCapacity === null ? "CAPACITY_UNKNOWN" : "SCHEDULE_FIT")),futureRelief:relief ? finish(relief,"SCHEDULE_FIT") : null,notToday,risks:notToday.filter(c=>c.reasonCodes.some(r=>["OVERDUE","DUE_TODAY","DEADLINE_RISK","COMMITMENT","FUTURE_CAPACITY_DEFICIT","FUTURE_CAPACITY_UNKNOWN"].includes(r))),currentMission,selectedTaskIds:selected.map(c=>c.taskId),eligibleTaskIds:eligible.map(c=>c.taskId),approvedPlan:evidence?.approvedPlan ?? null,capacityKnown:currentCapacity!==null,
    capacityConflicts:capacity.deadlineWindows.filter(window => window.availableMinutes !== null && window.knownRequiredWorkMinutes > window.availableMinutes).map(window => ({ startDate:window.startDate,endDate:window.endDate,availableMinutes:window.availableMinutes,knownRequiredWorkMinutes:window.knownRequiredWorkMinutes,taskIds:[...window.requiredTaskIds] })) });
}

export function outcomeFingerprint(input: unknown): string {
  const canonical = (value: unknown): unknown => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value;
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
