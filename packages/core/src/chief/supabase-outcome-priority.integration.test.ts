import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseMorningRepository } from "../morning/supabase-morning-repository.js";
import { getHomeOutcome, loadOutcomeEvidence, persistOutcomeJudgment } from "./supabase-outcome-priority.js";
import { judgeOutcomes, outcomeInputFromObservation, projectOutcomeCapacity } from "./outcome-priority.js";

const sql=postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",{max:5});
const owner=randomUUID() as UserId;
const other=randomUUID() as UserId;
const contextId=randomUUID(); const goalId=randomUUID(); const objectiveId=randomUUID(); const taskId=randomUUID(); const unitId=randomUUID();
const now=new Date("2026-09-26T09:00:00+09:00");
beforeAll(async()=>{
  await sql`insert into auth.users(id,email,created_at,updated_at) values(${owner},${`chief-${owner}@example.test`},now(),now()),(${other},${`chief-${other}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${owner},'Asia/Seoul'),(${other},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode,commitment_level,strategic_importance) values(${contextId},${owner},'certification','Certification','active','not_applicable','REQUIRED',5)`;
  await sql`insert into public.certification_profiles(work_context_id,user_id,study_mode,exam_date) values(${contextId},${owner},'CUMULATIVE','2026-09-28')`;
  await sql`insert into public.learning_units(id,user_id,work_context_id,title,position,exposure_state,understanding_state,validation_state) values(${unitId},${owner},${contextId},'Unit',1,'COMPLETE','WEAK','NOT_TESTED')`;
  await sql`insert into public.goals(id,user_id,title,importance,status,origin,level,period_start,period_end) values(${goalId},${owner},'Focus',4,'active','user','WEEKLY','2026-09-21','2026-09-27')`;
  await sql`insert into public.objectives(id,user_id,title,importance,status,origin,goal_id,work_context_id) values(${objectiveId},${owner},'Objective',4,'active','user',${goalId},${contextId})`;
  await sql`insert into public.tasks(id,user_id,work_context_id,objective_id,title,execution_mode,importance,status,estimated_user_minutes,planned_date,completion_criteria) values(${taskId},${owner},${contextId},${objectiveId},'Study','learning_required',4,'PLANNED',60,'2026-09-26','Pass practice check')`;
});
afterAll(async()=>{await sql`delete from auth.users where id in (${owner},${other})`;await sql.end();});
describe("Chief Priority v2 evidence loading",()=>{
  it("loads owner strategy, focus periods, certification and manual learning state",async()=>{
    const evidence=await loadOutcomeEvidence(sql,owner,"2026-09-26");
    expect(evidence.contexts).toContainEqual({id:contextId,commitmentLevel:"REQUIRED",strategicImportance:5,studyMode:"CUMULATIVE",examDate:"2026-09-28"});
    expect(evidence.goals[0]).toMatchObject({level:"WEEKLY",periodStart:"2026-09-21",periodEnd:"2026-09-27"});
    expect(evidence.learningUnits?.[0]).toMatchObject({id:unitId,exposureState:"COMPLETE",understandingState:"WEAK",validationState:"NOT_TESTED"});
    const foreign=await loadOutcomeEvidence(sql,other,"2026-09-26");
    expect(foreign.contexts).toEqual([]);expect(foreign.goals).toEqual([]);expect(foreign.learningUnits).toEqual([]);
  });
  it("recommends without a Morning workflow and keeps CurrentStatus on the same decision",async()=>{
    const observation=await new SupabaseMorningRepository(sql).loadObservation(owner,"2026-09-26","Asia/Seoul");
    expect(observation.tasks[0]!.plannedDate).toBe("2026-09-26");
    const result=await getHomeOutcome(sql,owner,"2026-09-26",observation,now);
    expect(result.judgment.currentMission?.taskId).toBe(taskId);
    expect(result.currentStatus.priorities[0]?.taskId).toBe(taskId);
    expect(result.judgment.todayPriority[0]!.reasonCodes).toEqual(expect.arrayContaining(["WEEKLY_FOCUS","REQUIRED_COMMITMENT","STRATEGIC_IMPORTANCE","LEARNING_STATE","FUTURE_CAPACITY_UNKNOWN"]));
    expect((await sql`select id from public.workflow_runs where user_id=${owner} and workflow_type='morning'`).length).toBe(0);
  });
  it("records decision evidence without persisting the Future Capacity projection or changing Task placement",async()=>{
    const observation=await new SupabaseMorningRepository(sql).loadObservation(owner,"2026-09-26","Asia/Seoul");
    const base=outcomeInputFromObservation(observation,now);
    const input={...base,futureCapacity:projectOutcomeCapacity(base)};
    const judgment=judgeOutcomes(input);
    const id=await persistOutcomeJudgment(sql,owner,input,judgment);
    const rows=await sql<{impact:Record<string,unknown>}[]>`select impact from public.decisions where id=${id} and user_id=${owner}`;
    expect(rows[0]!.impact).not.toHaveProperty("futureCapacity");
    expect(rows[0]!.impact).not.toHaveProperty("dailyAvailability");
    expect(await persistOutcomeJudgment(sql,owner,input,judgment)).toBe(id);
    const tasks=await sql<{planned_date:string;status:string}[]>`select planned_date::text,status from public.tasks where id=${taskId}`;
    expect(tasks[0]).toEqual({planned_date:"2026-09-26",status:"PLANNED"});
  });
});
