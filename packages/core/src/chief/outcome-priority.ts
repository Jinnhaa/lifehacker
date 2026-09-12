import { createHash } from "node:crypto";
import { z } from "zod";
import { getDaysUntilDeadline } from "../rules/deadline.js";
import { createMorningPlan } from "../morning/morning-planner.js";
import type { MorningObservation, TimeInterval } from "../morning/morning.js";

export interface OutcomeEvidence {
  dependencies: { taskId: string; prerequisiteTaskId: string; completed: boolean }[];
  steps: { id: string; taskId: string; position: number; owner: string; status: string; reviewOfStepId: string | null }[];
  objectives: { id: string; title: string; goalId: string | null; importance: number; status: string }[];
  goals: { id: string; title: string; importance: number; status: string }[];
  artifacts: { id: string; taskId: string | null; workContextId: string | null; type: string; reviewStatus: string | null; hash: string | null }[];
  approvedPlan: { id: string; revisionNo: number } | null;
  activeFocusTaskId: string | null;
  approvedAction: { taskId: string | null; title: string; startsAt: string; endsAt: string } | null;
}

export const reasonCodeSchema = z.enum(["OVERDUE", "DUE_TODAY", "COMMITMENT", "IMPORTANT", "GOAL", "UNBLOCKS", "REVIEW_NEXT", "CONTINUITY", "SCHEDULE_FIT", "BLOCKED", "CAPACITY", "UNKNOWN_EFFORT", "NOT_SELECTED", "ACTIVE_FOCUS", "APPROVED_PLAN", "CARRYOVER", "ESTIMATE_HISTORY", "BLOCKER_HISTORY", "USER_FEEDBACK"]);
const choiceSchema = z.object({ taskId: z.string(), outcome: z.string(), reasonCodes: z.array(reasonCodeSchema).min(1), rationale: z.string(), evidenceRefs: z.array(z.string()), minutes: z.number().nonnegative() });
export const outcomeJudgmentSchema = z.object({
  version: z.literal("chief-outcome-v1"),
  todayPriority: z.array(choiceSchema).max(3), futureRelief: choiceSchema.nullable(),
  notToday: z.array(choiceSchema), risks: z.array(choiceSchema),
  currentMission: z.object({ taskId: z.string().nullable(), title: z.string(), source: z.enum(["focus_session", "plan_item", "chief_recommendation"]), reasonCodes: z.array(reasonCodeSchema).min(1) }).nullable(),
  selectedTaskIds: z.array(z.string()), eligibleTaskIds: z.array(z.string()),
  approvedPlan: z.object({ id: z.string(), revisionNo: z.number() }).nullable(),
  contextRefs: z.array(z.string()).optional(),
  capacityKnown: z.boolean()
});
export type OutcomeJudgment = z.infer<typeof outcomeJudgmentSchema>;
type Choice = z.infer<typeof choiceSchema>;
export interface OutcomeInput { observation: MorningObservation; now: Date; workUntil: Date | null; privateIntervals: readonly TimeInterval[]; localWeekday: number }

const labels: Record<z.infer<typeof reasonCodeSchema>, string> = {
  CARRYOVER: "이전 Day Close에서 미완료로 확인되어 다시 검토합니다",
  ESTIMATE_HISTORY: "같은 작업 범위의 소요시간 오차가 여러 날 관찰되어 예상시간 확인이 필요합니다",
  BLOCKER_HISTORY: "같은 작업 범위의 막힘이 여러 날 관찰되어 시작 전 준비를 확인합니다",
  USER_FEEDBACK: "이 Task에 대한 이전 사용자 판단 이유를 함께 검토합니다",
  OVERDUE: "마감이 지났습니다", DUE_TODAY: "오늘 마감입니다", COMMITMENT: "명시적으로 승인한 약속입니다",
  IMPORTANT: "중요도가 높은 일입니다", GOAL: "활성 목표에 연결됩니다", UNBLOCKS: "실제 후속 Task의 선행 조건입니다",
  REVIEW_NEXT: "다음 단계가 명시된 사용자 검토입니다", CONTINUITY: "이미 진행하던 일입니다", SCHEDULE_FIT: "남은 가용시간에 완료 분량이 들어갑니다",
  BLOCKED: "선행 작업 또는 검토가 아직 남아 있습니다", CAPACITY: "확인된 가용시간에 완료 분량이 들어가지 않습니다",
  UNKNOWN_EFFORT: "완료에 필요한 시간을 확인해야 합니다", NOT_SELECTED: "오늘 핵심 결과보다 뒤에 두었습니다",
  ACTIVE_FOCUS: "현재 집중을 유지합니다", APPROVED_PLAN: "승인한 계획을 유지합니다"
};

export function judgeOutcomes(input: OutcomeInput): OutcomeJudgment {
  const { observation, now } = input;
  const evidence = observation.outcomeEvidence;
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
    if(observation.carryoverContext?.taskIds.includes(task.id)) { codes.push("CARRYOVER"); refs.push(`day-close:${observation.carryoverContext.sourceDate}`); }
    for(const p of observation.learningContext?.patterns ?? []) if(p.scope===task.workContextId || p.scope===`task:${task.id}`) {
      codes.push(["underestimated","overestimated","matched"].includes(p.signal) ? "ESTIMATE_HISTORY" : "BLOCKER_HISTORY"); refs.push(`pattern:${p.id}`);
    }
    for(const f of observation.learningContext?.feedback ?? []) if(f.taskIds.includes(task.id) && f.reason) { codes.push("USER_FEEDBACK"); refs.push(`decision-feedback:${f.id}`); }
    const deadline = [task.officialDeadline, task.internalDeadline].filter((d): d is Date => d !== null).sort((a,b)=>a.getTime()-b.getTime())[0] ?? null;
    const days = getDaysUntilDeadline(deadline, now, observation.timeZone);
    if (deadline && deadline < now) codes.push("OVERDUE"); else if (days === 0) codes.push("DUE_TODAY");
    for (const directive of observation.strategicDirectives) {
      const contains = (v: unknown): boolean => v === task.id || (Array.isArray(v) ? v.some(contains) : !!v && typeof v === "object" && Object.values(v).some(contains));
      if (contains(directive.priorityOrder)) { codes.push("COMMITMENT"); refs.push(`directive:${directive.id}`); }
    }
    if (task.importance >= 4) codes.push("IMPORTANT");
    const objective = evidence?.objectives.find(o=>o.id===task.objectiveId && o.status === "active");
    if (objective) { codes.push("GOAL"); refs.push(`objective:${objective.id}`); if (objective.goalId) refs.push(`goal:${objective.goalId}`); }
    const downstream = evidence?.dependencies.filter(d=>d.prerequisiteTaskId===task.id && !d.completed) ?? [];
    if (downstream.length) { codes.push("UNBLOCKS"); refs.push(...downstream.map(d=>`dependency:${d.taskId}:${task.id}`)); }
    const steps = evidence?.steps.filter(s=>s.taskId===task.id && !["completed", "skipped"].includes(s.status)).sort((a,b)=>a.position-b.position) ?? [];
    if (steps[0] && steps[1]?.owner === "user" && steps[1].reviewOfStepId === steps[0].id) { codes.push("REVIEW_NEXT"); refs.push(`step:${steps[1].id}`); }
    if (task.status === "IN_PROGRESS" || task.actualMinutes > 0) codes.push("CONTINUITY");
    refs.push(...(evidence?.artifacts.filter(a=>a.taskId===task.id || (task.workContextId && a.workContextId===task.workContextId)).map(a=>`artifact:${a.id}`) ?? []));
    const estimate = task.estimatedUserMinutes ?? task.estimatedMinutes;
    const minutes = estimate === null ? 0 : Math.max(0, estimate-task.actualMinutes);
    if (blocked.has(task.id)) codes.push("BLOCKED");
    if (!minutes) codes.push("UNKNOWN_EFFORT");
    return { taskId: task.id as string, outcome: task.completionCriteria || task.title, reasonCodes: [...new Set(codes)], rationale: "", evidenceRefs: refs, minutes, deadline: deadline?.getTime() ?? Infinity, importance: task.importance, unlocks: downstream.length };
  });
  // Ordered policy bands, not a weighted score. Calendar only validates fit.
  const band = (c: typeof choices[number]) => c.reasonCodes.includes("OVERDUE") ? 0 : c.reasonCodes.includes("DUE_TODAY") ? 1 : c.reasonCodes.includes("COMMITMENT") ? 2 : c.reasonCodes.includes("UNBLOCKS") ? 3 : c.reasonCodes.includes("IMPORTANT") ? 4 : c.reasonCodes.includes("GOAL") ? 5 : 6;
  choices.sort((a,b)=>band(a)-band(b) || a.deadline-b.deadline || b.unlocks-a.unlocks || b.importance-a.importance || Number(b.reasonCodes.includes("CARRYOVER"))-Number(a.reasonCodes.includes("CARRYOVER")) || a.taskId.localeCompare(b.taskId));
  const eligible = choices.filter(c=>!blocked.has(c.taskId) && c.minutes > 0);
  const selected: typeof choices = [];
  const fit = (next: typeof choices[number]): boolean => {
    if (!input.workUntil || input.workUntil <= now) return false;
    const list = [...selected, next];
    const draft = createMorningPlan({ ...input, workUntil: input.workUntil, observation: { ...observation, tasks: observation.tasks.filter(t=>list.some(c=>c.taskId===t.id)), chiefTaskOrder: list.map(c=>c.taskId) } });
    return list.every(c=>draft.items.filter(i=>i.taskId===c.taskId).reduce((n,i)=>n+i.plannedMinutes,0) >= c.minutes);
  };
  // Relief has a distinct evidence requirement; urgent/committed outcomes keep first claim.
  const reliefCandidates = eligible.filter(c=>band(c)>2 && (c.reasonCodes.includes("UNBLOCKS") || c.reasonCodes.includes("REVIEW_NEXT")));
  for (const choice of eligible) {
    if (selected.length === 3) break;
    if (fit(choice)) selected.push(choice);
  }
  const today = [...selected];
  let relief: typeof choices[number] | null = null;
  for (const c of reliefCandidates) if (!selected.includes(c) && fit(c)) { relief=c; selected.push(c); break; }
  const finish = (c: typeof choices[number], extra: Choice["reasonCodes"][number]): Choice => {
    const reasonCodes = [...new Set([...c.reasonCodes, extra])];
    return { taskId:c.taskId, outcome:c.outcome, minutes:c.minutes, evidenceRefs:c.evidenceRefs, reasonCodes, rationale:reasonCodes.map(code=>labels[code]).join(". ") + "." };
  };
  const notToday = choices.filter(c=>!selected.includes(c)).map(c=>finish(c, blocked.has(c.taskId) ? "BLOCKED" : !c.minutes ? "UNKNOWN_EFFORT" : fit(c) ? "NOT_SELECTED" : "CAPACITY"));
  let currentMission: OutcomeJudgment["currentMission"] = null;
  const focusTask = candidates.find(t=>t.id===evidence?.activeFocusTaskId);
  if (focusTask) currentMission={ taskId:focusTask.id,title:focusTask.title,source:"focus_session",reasonCodes:["ACTIVE_FOCUS"] };
  else {
    const occupied = observation.constraints.some(c=>c.blocksCapacity && c.start<=now && c.end>now) || input.privateIntervals.some(c=>c.start<=now && c.end>now);
    const action = evidence?.approvedAction;
    if (!occupied && action && new Date(action.startsAt)<=now && new Date(action.endsAt)>now && (!action.taskId || eligible.some(c=>c.taskId===action.taskId))) currentMission={ taskId:action.taskId,title:action.title,source:"plan_item",reasonCodes:["APPROVED_PLAN"] };
    else if (!occupied && !evidence?.approvedPlan && selected[0]) currentMission={taskId:selected[0].taskId,title:selected[0].outcome,source:"chief_recommendation",reasonCodes:["SCHEDULE_FIT"]};
  }
  return outcomeJudgmentSchema.parse({ contextRefs:observation.learningContext?.workstyle.map(p=>`workstyle:${p.id}:v${p.revision}`) ?? [], version:"chief-outcome-v1",todayPriority:today.map(c=>finish(c,"SCHEDULE_FIT")),futureRelief:relief ? finish(relief,"SCHEDULE_FIT") : null,notToday,risks:notToday.filter(c=>c.reasonCodes.some(r=>["OVERDUE","DUE_TODAY","COMMITMENT"].includes(r))),currentMission,selectedTaskIds:selected.map(c=>c.taskId),eligibleTaskIds:eligible.map(c=>c.taskId),approvedPlan:evidence?.approvedPlan ?? null,capacityKnown:input.workUntil!==null });
}

export function outcomeFingerprint(input: unknown): string {
  const canonical = (value: unknown): unknown => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value;
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
