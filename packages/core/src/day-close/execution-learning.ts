import type { UserId } from "@amber/shared";
import type { Sql, TransactionSql, JSONValue } from "postgres";
import type { DayCloseExecutionEvidence, DayCloseResult } from "./day-close.js";
import { outcomeJudgmentSchema } from "../chief/outcome-priority.js";

export async function readExecutionEvidence(sql: Sql, userId: UserId, date: string, start: Date, end: Date): Promise<DayCloseExecutionEvidence> {
  const [events, plans, estimates, judgments, sessions, corrections] = await Promise.all([
    sql<{id:string; type:string; task_id:string|null; occurred_at:Date; actor:string; payload:Record<string,unknown>}[]>`
      select e.id,e.event_type type,coalesce(f.task_id,case when e.aggregate_type='task' then e.aggregate_id end) task_id,
        e.occurred_at,e.actor_type actor,e.payload from public.domain_events e
      left join public.focus_sessions f on f.id=e.aggregate_id and f.user_id=e.user_id and e.aggregate_type='focus_session'
      where e.user_id=${userId} and e.occurred_at>=${start} and e.occurred_at<${end}
        and e.event_type in ('focus_blocked','focus_resumed','focus_started','focus_completed','task_switched','task_completed','replan_triggered','plan_replanned') order by e.occurred_at,e.id`,
    sql<{id:string; revision:number; status:string}[]>`select id,revision_no revision,status from public.daily_plans where user_id=${userId} and plan_date=${date} order by revision_no`,
    sql<{task_id:string; work_context_id:string|null; estimate:number|null; actual:number|null; completed:boolean; session_ids:string[]; deadline:Date|null}[]>`
      select t.id task_id,t.work_context_id,coalesce(t.estimated_user_minutes,t.estimated_minutes) estimate,
        (select sum(f.actual_minutes)::int from public.focus_sessions f where f.user_id=t.user_id and f.task_id=t.id and f.ended_at is not null and f.ended_at<${end}) actual,
        (t.status='DONE') completed,least(t.official_deadline,t.internal_deadline) deadline,
        array(select f.id::text from public.focus_sessions f where f.user_id=t.user_id and f.task_id=t.id and f.ended_at is not null and f.ended_at<${end} order by f.id) session_ids
      from public.tasks t where t.user_id=${userId} and (
        exists(select 1 from public.plan_items i join public.daily_plans p on p.id=i.daily_plan_id and p.user_id=i.user_id where i.user_id=t.user_id and i.task_id=t.id and p.plan_date=${date} and p.status in ('approved','superseded','closed'))
        or exists(select 1 from public.focus_sessions f where f.user_id=t.user_id and f.task_id=t.id and f.started_at>=${start} and f.started_at<${end})) order by t.id`,
    sql<{id:string; recommendation:unknown; judged_at:Date}[]>`select d.id,d.ai_recommendation recommendation,w.started_at judged_at from public.decisions d join public.workflow_runs w on w.id=d.workflow_run_id and w.user_id=d.user_id where d.user_id=${userId} and w.workflow_type='chief_outcome_priority' and w.started_at>=${start} and w.started_at<${end} order by w.started_at,d.id`,
    sql<{id:string; task_id:string; started_at:Date; completed:boolean}[]>`select f.id,f.task_id,f.started_at,(t.status='DONE') completed from public.focus_sessions f join public.tasks t on t.id=f.task_id and t.user_id=f.user_id where f.user_id=${userId} and f.started_at>=${start} and f.started_at<${end} order by f.started_at,f.id`,
    sql<{decisionId:string; feedbackId:string; userChoice:unknown; userReason:string|null}[]>`select d.id "decisionId",f.id "feedbackId",f.user_choice "userChoice",f.user_reason "userReason" from public.decisions d join public.decision_feedback f on f.decision_id=d.id and f.user_id=d.user_id where d.user_id=${userId} and f.created_at>=${start} and f.created_at<${end} order by f.created_at,f.id`
  ]);
  return {
    events:events.map(e=>({id:e.id,type:e.type,taskId:e.task_id,occurredAt:e.occurred_at.toISOString(),actor:e.actor,payload:e.payload})), plans,
    estimates:estimates.map(e=>({taskId:e.task_id,workContextId:e.work_context_id,estimatedMinutes:e.estimate,actualMinutes:e.actual,deltaMinutes:e.actual===null || e.estimate===null ? null : e.actual-e.estimate,completed:e.completed,sessionIds:e.session_ids,deadlineAt:e.deadline?.toISOString() ?? null,overdueByNextMorning:!e.completed && e.deadline!==null && e.deadline<end})),
    chief:judgments.flatMap((j,index)=>{
      const parsed=outcomeJudgmentSchema.safeParse(j.recommendation);
      if(!parsed.success) return [];
      const relevant=sessions.filter(s=>s.started_at>=j.judged_at && (!judgments[index+1] || s.started_at<judgments[index+1]!.judged_at));
      const selected=parsed.data.selectedTaskIds;
      return [{decisionId:j.id,selectedTaskIds:selected,completedTaskIds:estimates.filter(t=>t.completed && selected.includes(t.task_id)).map(t=>t.task_id),futureReliefTaskId:parsed.data.futureRelief?.taskId ?? null,executedTaskIds:[...new Set(relevant.map(s=>s.task_id))],notTodayExecutedTaskIds:[...new Set(relevant.filter(s=>parsed.data.notToday.some(n=>n.taskId===s.task_id)).map(s=>s.task_id))],alternativeTaskIds:[...new Set(relevant.filter(s=>!selected.includes(s.task_id)).map(s=>s.task_id))],sessionIds:relevant.map(s=>s.id),reason:null}];
    }), corrections
  };
}

// Pure observations use nullable Decision links; a different action alone is not a user correction.
export async function storeExecutionLearning(tx: TransactionSql, userId: UserId, result: DayCloseResult, eventId: string, now: Date): Promise<void> {
  const evidence=result.executionEvidence;
  if(!evidence) return;
  const observations: {key:string; type:"estimate"|"intervention"|"planning"; signal:string; context:string; taskId:string|null; data:unknown; decisionId:string|null}[]=[];
  for(const e of evidence.estimates) if(e.completed && e.estimatedMinutes!==null && e.estimatedMinutes>0 && e.actualMinutes!==null && e.actualMinutes>0) observations.push({key:`estimate:${e.taskId}`,type:"estimate",signal:e.actualMinutes>e.estimatedMinutes ? "underestimated" : e.actualMinutes<e.estimatedMinutes ? "overestimated" : "matched",context:e.workContextId ?? `task:${e.taskId}`,taskId:e.taskId,data:e,decisionId:null});
  for(const e of evidence.events) if(e.type==='focus_blocked' && typeof e.payload.category==='string') observations.push({key:`blocker:${e.id}`,type:"intervention",signal:e.payload.category,context:evidence.estimates.find(t=>t.taskId===e.taskId)?.workContextId ?? `task:${e.taskId}`,taskId:e.taskId,data:e,decisionId:null});
  for(const e of evidence.chief) observations.push({key:`chief:${e.decisionId}`,type:"planning",signal:"chief_result",context:result.date,taskId:null,data:e,decisionId:e.decisionId});
  for(const o of observations) {
    const key=o.type === "estimate" ? `execution:${o.key}` : `day-close:${result.date}:${o.key}`;
    const existing=await tx`select id from public.learning_cases where user_id=${userId} and context_snapshot->>'observationKey'=${key}`;
    if(existing.length) continue;
    const [row]=await tx<{id:string}[]>`insert into public.learning_cases(user_id,case_type,decision_id,context_snapshot,status,closed_at) values(${userId},${o.type},${o.decisionId},${tx.json({observationKey:key,date:result.date,signal:o.signal,scope:o.context,taskId:o.taskId,observation:o.data,reason:null} as JSONValue)},'closed',${now}) returning id`;
    await tx`insert into public.learning_case_events(learning_case_id,domain_event_id,event_role) values(${row!.id},${eventId},'outcome')`;
    await tx`insert into public.outcomes(user_id,learning_case_id,source_event_id,outcome_type,summary,payload,observed_at) values(${userId},${row!.id},${eventId},'execution_observation','실행 기록 관찰; 원인은 추론하지 않음',${tx.json(o.data as JSONValue)},${now})`;
  }
}

export interface GroundedLearningContext {
  patterns: { id:string; scope:string; signal:string; count:number; confidence:number; status:string }[];
  feedback: { id:string; decisionId:string; reason:string|null; taskIds:string[] }[];
  workstyle: { id:string; revision:number }[];
}

export async function readGroundedLearning(sql:Sql,userId:UserId,before:Date,taskIds:readonly string[],contextIds:readonly string[]):Promise<GroundedLearningContext> {
  const [patterns,feedback,workstyle]=await Promise.all([
    sql<{id:string; scope:string; signal:string; count:number; confidence:number; status:string}[]>`select id,condition->>'situationType' scope,condition->>'consistencyValue' signal,evidence_count count,confidence::float confidence,status from public.patterns where user_id=${userId} and status in ('candidate','active') and last_observed_at<${before} and evidence_count>=3 and pattern_type='execution_observation' order by id`,
    sql<{id:string; decision_id:string; reason:string|null; situation:Record<string,unknown>}[]>`select f.id,f.decision_id,f.user_reason reason,d.impact->'context' situation from public.decision_feedback f join public.decisions d on d.id=f.decision_id and d.user_id=f.user_id where f.user_id=${userId} and f.created_at<${before} and f.created_at>=${new Date(before.getTime()-30*86400000)} order by f.created_at desc,f.id limit 30`,
    sql<{id:string; revision:number}[]>`select id,revision from public.workstyle_profiles where user_id=${userId} and active=true and (scope_type='global' or agent_type='chief') order by id`
  ]);
  const scopes=new Set([...contextIds,...taskIds.map(id=>`task:${id}`)]);
  return {patterns:patterns.filter(p=>scopes.has(p.scope)),feedback:feedback.flatMap(f=>{
    const ids=Array.isArray(f.situation?.taskIds) ? f.situation.taskIds.filter((id):id is string=>typeof id==='string' && taskIds.includes(id)) : [];
    return ids.length ? [{id:f.id,decisionId:f.decision_id,reason:f.reason,taskIds:ids}] : [];
  }),workstyle};
}
