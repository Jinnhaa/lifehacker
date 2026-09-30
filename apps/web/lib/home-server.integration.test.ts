import { randomUUID } from "node:crypto";
import type { TaskId, UserId } from "@amber/shared";
import { SupabaseFocusRepository } from "@amber/core";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadHomeViewModel } from "./home-server";
import { canStartHomeQuest } from "./home-chief-presentation";

vi.mock("server-only",()=>({}));
vi.mock("./web-runtime",()=>({getWebSql:()=>sql,getWebUserId:()=>owner}));
const sql=postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",{max:5});
const owner=randomUUID() as UserId;const taskId=randomUUID() as TaskId;const contextId=randomUUID();const hardId=randomUUID();
const now=new Date("2026-09-26T09:00:00+09:00");
const fetchSpy=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("External API must not be called"));
beforeAll(async()=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(now);
  await sql`insert into auth.users(id,email,created_at,updated_at) values(${owner},${`home-${owner}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${owner},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values(${contextId},${owner},'course','Course','active','not_applicable')`;
  await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,importance,status,estimated_user_minutes,completion_criteria,scope_exclusions)
    values(${taskId},${owner},${contextId},'Study','standard',3,'PLANNED',30,'Pass explicit check','No visual polish')`;
});
afterAll(async()=>{vi.useRealTimers();fetchSpy.mockRestore();await sql`delete from auth.users where id=${owner}`;await sql.end();});
describe("Home canonical Chief adapter",()=>{
  it("loads an actionable Main Quest without a Morning plan or workflow",async()=>{
    const home=await loadHomeViewModel();
    expect(home.error).toBeNull();expect(home.configured).toBe(true);expect(home.planState.status).toBe("no_plan");
    expect(home.currentAction).toMatchObject({taskId,title:"Study",context:"Course",completionCriteria:"Pass explicit check",scopeExclusions:"No visual polish"});
    expect(home.currentAction?.taskId).toBe(home.outcomePriority?.judgment.currentMission?.taskId);
    expect(canStartHomeQuest(home)).toBe(true);expect(home.availableMinutes).toBeNull();
  });
  it("does not gate the canonical recommendation on pending Morning approval",async()=>{
    await sql`insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,created_by) values(${owner},'2026-09-26','Asia/Seoul',1,'pending_approval','system')`;
    const home=await loadHomeViewModel();
    expect(home.planState.status).toBe("pending_approval");expect(home.currentAction?.taskId).toBe(taskId);expect(canStartHomeQuest(home)).toBe(true);
  });
  it("starts the explicit canonical Task without an approved plan and preserves continuity on read",async()=>{
    const result=await new SupabaseFocusRepository(sql).start(owner,"2026-09-26",now,`home-start:${randomUUID()}`,45,"Asia/Seoul",{kind:"task",id:taskId});
    expect(result.context).not.toBeNull();
    const home=await loadHomeViewModel();expect(home.currentAction?.taskId).toBe(taskId);expect(home.focus).toMatchObject({step:"active",taskId,title:"Study"});
    expect(canStartHomeQuest(home)).toBe(false);
  });
  it("shows stronger canonical evidence without auto-ending active Focus or calling API",async()=>{
    const before=await sql<{id:string;status:string;task_id:string}[]>`select id,status,task_id from public.focus_sessions where user_id=${owner} and status='active'`;
    await sql`insert into public.tasks(id,user_id,title,execution_mode,importance,status,estimated_user_minutes,official_deadline) values(${hardId},${owner},'Hard deadline','standard',3,'PLANNED',30,'2026-09-26T23:59:00+09:00')`;
    const home=await loadHomeViewModel();expect(home.currentAction?.taskId).toBe(hardId);expect(home.currentAction?.whyNow).toContain("오늘 공식 마감");
    expect(home.focus?.taskId).toBe(taskId);expect(canStartHomeQuest(home)).toBe(false);
    const after=await sql<{id:string;status:string;task_id:string}[]>`select id,status,task_id from public.focus_sessions where user_id=${owner} and status='active'`;
    expect(after).toEqual(before);expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("reconciles Learning before refreshing canonical Chief Task reality",async()=>{
    const stageId=randomUUID();const materialId=randomUUID();const policyId=randomUUID();
    await sql`insert into public.learning_stages(id,user_id,work_context_id,title,position,status)
      values(${stageId},${owner},${contextId},'Current',1,'ACTIVE')`;
    await sql`insert into public.learning_materials(id,user_id,work_context_id,stage_id,title,material_type,unit_type,total_units,status)
      values(${materialId},${owner},${contextId},${stageId},'DB 교안','slides','LESSON',1,'ACTIVE')`;
    await sql`insert into public.learning_units(user_id,work_context_id,title,position,stage_id,material_id,sequence_no,unit_type)
      values(${owner},${contextId},'DB 1',1,${stageId},${materialId},1,'LESSON')`;
    await sql`insert into public.learning_allocation_policies(id,user_id,work_context_id,stage_id,name,profile_type,priority,active)
      values(${policyId},${owner},${contextId},${stageId},'Next lesson','normal',1,true)`;
    await sql`insert into public.learning_allocation_items(user_id,allocation_policy_id,material_id,target_units,estimated_minutes_min,estimated_minutes_max,position,active)
      values(${owner},${policyId},${materialId},1,30,30,1,true)`;

    const home=await loadHomeViewModel();
    const generated=await sql<{id:string;execution_mode:string}[]>`select id,execution_mode from public.tasks
      where user_id=${owner} and work_context_id=${contextId} and title='DB 교안 1강'`;
    expect(generated).toHaveLength(1);
    expect(generated[0]?.execution_mode).toBe("learning_required");
    expect(home.outcomePriority?.judgment.eligibleTaskIds).toContain(generated[0]!.id);
    expect(home.learningSpecialist?.activeTaskIds).toContain(generated[0]!.id);
    expect(home.outcomePriority?.judgment.eligibleTaskIds.some((id)=>id.startsWith("learning:"))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
