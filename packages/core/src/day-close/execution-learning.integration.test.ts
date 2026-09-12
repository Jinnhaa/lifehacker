import { randomUUID } from "node:crypto";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SupabaseDayCloseRepository } from "./supabase-day-close-repository.js";
import { DayCloseService } from "./day-close-service.js";
import { DecisionLearningService } from "../decision-learning/decision-learning-service.js";
import { SupabaseDecisionLearningRepository } from "../decision-learning/supabase-decision-learning-repository.js";
import { SupabasePatternLearningRepository } from "../pattern-learning/supabase-pattern-learning-repository.js";
import { SupabaseMorningRepository } from "../morning/supabase-morning-repository.js";
import { SupabasePrincipleApprovalRepository } from "../principle-approval/supabase-principle-approval-repository.js";
import { judgeOutcomes } from "../chief/outcome-priority.js";
import { persistOutcomeJudgment } from "../chief/supabase-outcome-priority.js";

const sql=postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",{max:5});
const user=randomUUID() as UserId;
const project=randomUUID();
const carry=randomUUID();
const blocked=randomUUID();
const repository=new SupabaseDayCloseRepository(sql);
const morning=new SupabaseMorningRepository(sql);
beforeAll(async()=>{
  await sql`insert into auth.users(id,email) values(${user},${`learning-${user}@example.test`})`;
  await sql`insert into public.profiles(id,timezone) values(${user},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values(${project},${user},'project','Synthetic learning project','active','disabled')`;
  await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,estimated_minutes,importance,status) values(${carry},${user},${project},'Continue next day','standard',30,5,'INBOX'),(${blocked},${user},${project},'Unresolved','standard',30,3,'BLOCKED')`;
});
afterAll(async()=>{await sql`delete from auth.users where id=${user}`;await sql.end();});

it('closes three evidence-backed days, deduplicates observations and consumes scoped patterns in next Chief',async()=>{
  const doneIds:string[]=[];
  for(let day=4;day<=6;day++) {
    const date=`2026-09-0${day}`;
    const start=new Date(`${date}T00:00:00Z`);
    const end=new Date(`${date}T00:56:00Z`);
    const close=new Date(`${date}T14:00:00Z`);
    const taskId=randomUUID();doneIds.push(taskId);
    const session=randomUUID();const plan=randomUUID();
    const observation=await morning.loadObservation(user,date,'Asia/Seoul');
    const input={observation,now:start,workUntil:new Date(`${date}T03:00:00Z`),privateIntervals:[],localWeekday:day};
    const recommendation=judgeOutcomes(input);
    const decisionId=await persistOutcomeJudgment(sql,user,input,recommendation);
    await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,estimated_minutes,importance,status,completed_at) values(${taskId},${user},${project},'Synthetic completed','standard',30,3,'DONE',${end})`;
    await sql`insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by) values(${plan},${user},${date},'Asia/Seoul',1,'draft','{}','test')`;
    await sql`insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,planned_minutes,status) values(${user},${plan},1,'task',${taskId},30,'completed'),(${user},${plan},2,'task',${carry},30,'planned'),(${user},${plan},3,'task',${blocked},30,'blocked')`;
    await sql`update public.daily_plans set status='approved',approved_at=${start} where id=${plan}`;
    await sql`insert into public.focus_sessions(id,user_id,task_id,status,started_at,ended_at,actual_minutes,end_reason) values(${session},${user},${taskId},'completed',${new Date(start.getTime()+60000)},${end},55,'task_completed')`;
    await sql`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload) values(${user},'focus_blocked','focus_session',${session},'user',${end},gen_random_uuid(),${`block-${day}`},1,'{"category":"perfectionism"}'),(${user},'replan_triggered','daily_plan',${plan},'user',${end},gen_random_uuid(),${`replan-${day}`},1,'{"reason":"manual_replan"}')`;
    const clock=new FixedClock(close);
    const learning=new DecisionLearningService({repository:new SupabaseDecisionLearningRepository(sql),clock,patternLearning:new SupabasePatternLearningRepository(sql)});
    const service=new DayCloseService({repository,clock,decisionLearning:learning});
    const message={userId:user,timeZone:'Asia/Seoul',text:'오늘 끝',messageId:`test:${day}`,receivedAt:close};
    if(day===4) {
      const [workflow]=await sql<{id:string}[]>`select workflow_run_id id from public.decisions where id=${decisionId}`;
      const recorded=await new SupabaseDecisionLearningRepository(sql).recordMaterialDecision({
        userId:user,workflowRunId:workflow!.id,idempotencyKey:'explicit-test-correction',decisionType:'focus_task_switch',
        situation:{planDate:date,taskIds:[carry]},amberRecommendation:{chiefDecisionId:decisionId},
        userChoice:{action:'switch_task',taskId},userMessage:'마감 때문에',occurredAt:close
      },'마감 때문에');
      await sql`update public.decision_feedback set created_at=${close} where id=${recorded.feedbackId}`;
    }
    await service.handleDayCloseMessage(message);
    const result=(await repository.findWorkflow(user,date))!.checkpoint.result!;
    expect(result.completedTaskIds).toContain(taskId);
    expect(result.carryoverTaskIds).toEqual(expect.arrayContaining([carry,blocked]));
    expect(result.carryoverTaskIds).not.toContain(taskId);
    expect(result.executionEvidence?.estimates.find(t=>t.taskId===taskId)).toMatchObject({estimatedMinutes:30,actualMinutes:55,deltaMinutes:25});
    expect(result.executionEvidence?.estimates.find(t=>t.taskId===carry)?.actualMinutes).toBeNull();
    expect(result.executionEvidence?.chief.find(c=>c.decisionId===decisionId)).toMatchObject({alternativeTaskIds:[taskId],reason:null});
    expect(result.executionEvidence?.events.some(e=>e.type==='replan_triggered' && e.actor==='user')).toBe(true);
    const before=await sql<{count:number}[]>`select count(*)::int count from public.learning_cases where user_id=${user}`;
    await service.handleDayCloseMessage({...message,messageId:`retry:${day}`});
    expect(await sql`select count(*)::int count from public.learning_cases where user_id=${user}`).toEqual(before);
    const patterns=await sql<{status:string}[]>`select status from public.patterns where user_id=${user}`;
    if(day<6) expect(patterns).toHaveLength(0);
    else expect(patterns.map(p=>p.status)).toEqual(['candidate','candidate']);
  }
  const next=await morning.loadObservation(user,'2026-09-07','Asia/Seoul');
  expect(next.tasks.find(t=>t.id===blocked)?.status).toBe('BLOCKED');
  expect(next.carryoverContext?.taskIds).toEqual(expect.arrayContaining([carry,blocked]));
  expect(next.tasks.some(t=>doneIds.includes(t.id))).toBe(false);
  expect(next.learningContext?.feedback[0]?.reason).toBe('마감 때문에');
  expect(next.learningContext?.patterns.map(p=>p.signal).sort()).toEqual(['perfectionism','underestimated']);
  const judgment=judgeOutcomes({observation:next,now:new Date('2026-09-07T00:00:00Z'),workUntil:new Date('2026-09-07T03:00:00Z'),privateIntervals:[],localWeekday:1});
  expect(judgment.todayPriority.find(t=>t.taskId===carry)?.reasonCodes).toEqual(expect.arrayContaining(['CARRYOVER','ESTIMATE_HISTORY','BLOCKER_HISTORY','USER_FEEDBACK']));
  expect(judgment.selectedTaskIds).not.toContain(blocked);
  expect((await sql<{estimate:number}[]>`select estimated_minutes estimate from public.tasks where id=${doneIds[0]!}`)[0]?.estimate).toBe(30);
  expect((await sql`select id from public.workstyle_profiles where user_id=${user}`).length).toBe(0);
  expect(await new SupabasePrincipleApprovalRepository(sql).createEligibleProposal(user,new Date('2026-09-07T00:00:00Z'))).toBeNull();
  expect((await sql`select id from public.principles where user_id=${user}`).length).toBe(0);
  expect((await sql`select id from public.domain_events where user_id=${user} and event_type='day_closed'`).length).toBe(3);
});
