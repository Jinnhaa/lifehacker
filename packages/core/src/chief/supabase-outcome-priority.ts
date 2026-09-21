import { randomUUID } from "node:crypto";
import { zonedDateTimeToUtc, type UserId } from "@amber/shared";
import type { Sql, JSONValue } from "postgres";
import type { MorningObservation } from "../morning/morning.js";
import { deriveCurrentAction } from "../execution/current-action.js";
import { judgeOutcomes, outcomeFingerprint, outcomeJudgmentSchema, type OutcomeEvidence, type OutcomeInput, type OutcomeJudgment } from "./outcome-priority.js";
import { deriveCurrentStatus } from "./current-status.js";

export async function loadOutcomeEvidence(sql: Sql, userId: UserId, date: string, timeZone = "Asia/Seoul"): Promise<OutcomeEvidence> {
  const dayStart = zonedDateTimeToUtc(`${date}T00:00:00`, timeZone);
  const dayEnd = zonedDateTimeToUtc(`${date}T23:59:59`, timeZone);
  const [dependencies, steps, objectives, goals, artifacts, plans, focuses, action, completed, plannedToday, focusEvidence] = await Promise.all([
    sql<{ task_id:string; prerequisite_task_id:string; completed:boolean }[]>`select d.task_id,d.prerequisite_task_id,(p.status='DONE') completed from public.task_dependencies d join public.tasks p on p.id=d.prerequisite_task_id and p.user_id=d.user_id join public.tasks t on t.id=d.task_id and t.user_id=d.user_id where d.user_id=${userId} and t.status<>'DONE' order by d.task_id,d.prerequisite_task_id`,
    sql<{ id:string; task_id:string; position:number; owner:string; status:string; review_of_step_id:string|null }[]>`select id,task_id,position,owner,status,review_of_step_id from public.task_steps where user_id=${userId} order by task_id,position`,
    sql<{ id:string; title:string; goal_id:string|null; importance:number; status:string }[]>`select id,title,goal_id,importance,status from public.objectives where user_id=${userId} order by id`,
    sql<{ id:string; title:string; importance:number; status:string }[]>`select id,title,importance,status from public.goals where user_id=${userId} order by id`,
    sql<{ id:string; task_id:string|null; work_context_id:string|null; artifact_type:string; review_status:string|null; content_hash:string|null }[]>`select id,task_id,work_context_id,artifact_type,review_status,content_hash from public.artifacts where user_id=${userId} and (review_status='accepted' or artifact_type in ('project_state_snapshot','gap_analysis')) order by id`,
    sql<{id:string; revision_no:number}[]>`select id,revision_no from public.daily_plans where user_id=${userId} and plan_date=${date} and status='approved' order by revision_no desc limit 1`,
    sql<{ task_id: string | null; activity_occurrence_id: string | null; title: string }[]>`
      select f.task_id,f.activity_occurrence_id,coalesce(t.title,a.title,'집중') title
      from public.focus_sessions f
      left join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
      left join public.activity_occurrences o on o.id=f.activity_occurrence_id and o.user_id=f.user_id
      left join public.recurring_activities a on a.id=o.recurring_activity_id and a.user_id=o.user_id
      where f.user_id=${userId} and f.status='active' order by f.started_at desc limit 1`,
    deriveCurrentAction(sql,userId,date,timeZone),
    sql<{ count: number }[]>`select count(*)::int count from public.tasks where user_id=${userId} and status='DONE' and completed_at>=${dayStart} and completed_at<=${dayEnd}`,
    sql<{ task_id: string }[]>`
      select distinct i.task_id from public.daily_plans p
      join public.plan_items i on i.daily_plan_id=p.id and i.user_id=p.user_id
      join public.tasks t on t.id=i.task_id and t.user_id=i.user_id and t.status<>'DONE'
      where p.user_id=${userId} and p.plan_date=${date} and p.status='approved' and i.task_id is not null`,
    sql<{ work_context_id: string; completed_sessions: number; actual_minutes: number }[]>`
      select x.work_context_id,count(*) filter(where f.status='completed')::int completed_sessions,
        coalesce(sum(f.actual_minutes),0)::int actual_minutes
      from public.focus_sessions f
      join lateral (
        select t.work_context_id from public.tasks t where t.id=f.task_id and t.user_id=f.user_id
        union all
        select e.external_id::uuid work_context_id from public.activity_occurrences o
          join public.external_references e on e.user_id=o.user_id and e.internal_entity_type='recurring_activity'
            and e.internal_entity_id=o.recurring_activity_id and e.source='amber' and e.external_type='course_study_workload'
          where o.id=f.activity_occurrence_id and o.user_id=f.user_id
        limit 1
      ) x on x.work_context_id is not null
      where f.user_id=${userId}
      group by x.work_context_id`
  ]);
  const times = action?.planItemId ? await sql<{planned_start_at:Date; planned_end_at:Date}[]>`select planned_start_at,planned_end_at from public.plan_items where id=${action.planItemId} and user_id=${userId}` : [];
  return {
    dependencies:dependencies.map(d=>({taskId:d.task_id,prerequisiteTaskId:d.prerequisite_task_id,completed:d.completed})),
    steps:steps.map(s=>({id:s.id,taskId:s.task_id,position:s.position,owner:s.owner,status:s.status,reviewOfStepId:s.review_of_step_id})),
    objectives:objectives.map(o=>({id:o.id,title:o.title,goalId:o.goal_id,importance:o.importance,status:o.status})),goals,
    artifacts:artifacts.map(a=>({id:a.id,taskId:a.task_id,workContextId:a.work_context_id,type:a.artifact_type,reviewStatus:a.review_status,hash:a.content_hash})),
    approvedPlan:plans[0] ? {id:plans[0].id,revisionNo:plans[0].revision_no} : null,
    activeFocusTaskId:focuses[0]?.task_id ?? null,
    activeFocus: focuses[0] ? {
      taskId: focuses[0].task_id,
      occurrenceId: focuses[0].activity_occurrence_id,
      title: focuses[0].title
    } : null,
    approvedAction:action && times[0]?.planned_start_at && times[0].planned_end_at ? {taskId:action.kind==='task' ? action.taskId : null,title:action.title,startsAt:times[0].planned_start_at.toISOString(),endsAt:times[0].planned_end_at.toISOString()} : null,
    completedTodayCount: completed[0]?.count ?? 0,
    plannedTodayTaskIds: plannedToday.map((item) => item.task_id),
    focusEvidence: focusEvidence.map((item) => ({ workContextId: item.work_context_id, completedSessions: item.completed_sessions, actualMinutes: item.actual_minutes }))
  };
}

export async function persistOutcomeJudgment(sql:Sql,userId:UserId,input:OutcomeInput,judgment:OutcomeJudgment): Promise<string> {
  const hash=outcomeFingerprint({input,judgment});
  return sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${userId}:chief-outcome:${hash}`},0))`;
    const existing=await tx<{id:string}[]>`select d.id from public.decisions d join public.workflow_runs w on w.id=d.workflow_run_id and w.user_id=d.user_id where d.user_id=${userId} and w.idempotency_key=${`chief-outcome:${hash}`}`;
    if(existing[0]) return existing[0].id;
    const correlation=randomUUID();
    const [workflow]=await tx<{id:string}[]>`insert into public.workflow_runs(user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at,completed_at) values(${userId},'chief_outcome_priority','completed','judged',${tx.json({hash})},1,${`chief-outcome:${hash}`},${correlation},${input.now},${input.now}) returning id`;
    const [decision]=await tx<{id:string}[]>`insert into public.decisions(user_id,workflow_run_id,question,why_now,options,ai_recommendation,ai_reason,impact,status) values(${userId},${workflow!.id},'오늘 무엇을 끝낼 것인가?','실제 마감·약속·dependency와 가용시간 검토',${tx.json(judgment.notToday as unknown as JSONValue)},${tx.json(judgment as unknown as JSONValue)},'chief-outcome-v1 deterministic evidence policy',${tx.json(JSON.parse(JSON.stringify(input)) as JSONValue)},'recommended') returning id`;
    await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload) values(${userId},'chief_outcome_judged','decision',${decision!.id},'system',${input.now},${correlation},${workflow!.id},${`chief-outcome:${hash}`},1,${tx.json({decisionId:decision!.id,hash,approvedPlan:judgment.approvedPlan})})`;
    return decision!.id;
  });
}

export async function getHomeOutcome(sql:Sql,userId:UserId,date:string,observation:MorningObservation,now:Date) {
  const [workflows]=await sql<{checkpoint_state:Record<string,unknown>}[]>`select checkpoint_state from public.workflow_runs where user_id=${userId} and workflow_type='morning' and checkpoint_state->>'planDate'=${date} order by updated_at desc limit 1`;
  const configured=observation.planningPolicy.defaultWorkUntil ?? observation.planningPolicy.workUntil;
  const value=workflows?.checkpoint_state.workUntil;
  const workUntil=typeof value==='string' ? new Date(value) : typeof configured==='string' && /^\d{2}:\d{2}$/.test(configured) ? zonedDateTimeToUtc(`${date}T${configured}:00`,observation.timeZone) : null;
  const rawIntervals=workflows?.checkpoint_state.privateIntervals;
  const privateIntervals=Array.isArray(rawIntervals) ? rawIntervals.flatMap(v=>{
    if(!v || typeof v!=='object') return [];
    const r=v as Record<string,unknown>; const start=new Date(String(r.start));const end=new Date(String(r.end));
    return Number.isFinite(start.getTime()) && end>start ? [{start,end}] : [];
  }) : [];
  const weekday=new Date(`${date}T00:00:00Z`).getUTCDay();
  const input:OutcomeInput={observation,now:new Date(Math.ceil(now.getTime()/60_000)*60_000),workUntil:workUntil && Number.isFinite(workUntil.getTime()) ? workUntil : null,privateIntervals,localWeekday:weekday || 7};
  const judgment=outcomeJudgmentSchema.parse(judgeOutcomes(input));
  const decisionId=await persistOutcomeJudgment(sql,userId,input,judgment);
  const capacityEnd=input.workUntil && input.workUntil>input.now ? input.workUntil : null;
  const occupied=[...observation.constraints.filter(item=>item.blocksCapacity),...privateIntervals]
    .map(item=>({start:new Date(Math.max(item.start.getTime(),input.now.getTime())),end:new Date(Math.min(item.end.getTime(),capacityEnd?.getTime() ?? input.now.getTime()))}))
    .filter(item=>item.end>item.start).sort((a,b)=>a.start.getTime()-b.start.getTime());
  let blockedMinutes=0;let cursor=0;
  for(const item of occupied){const start=Math.max(cursor,item.start.getTime());if(item.end.getTime()>start){blockedMinutes+=(item.end.getTime()-start)/60_000;cursor=item.end.getTime();}}
  const remainingCapacityMinutes=capacityEnd ? Math.max(0,Math.floor((capacityEnd.getTime()-input.now.getTime())/60_000-blockedMinutes-observation.planningBufferMinutes)) : null;
  const currentStatus=deriveCurrentStatus({observation,now:input.now,planDate:date,remainingCapacityMinutes});
  return {judgment,decisionId,currentStatus};
}
