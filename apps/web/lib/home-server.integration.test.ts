import { randomUUID } from "node:crypto";
import type { TaskId, UserId } from "@amber/shared";
import { buildWorldModelSnapshot, SupabaseFocusRepository } from "@amber/core";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadHomeViewModel } from "./home-server";
import { canStartHomeQuest } from "./home-chief-presentation";
import { completeHomeQuestAction, runFocusAction } from "../app/actions";

vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("./web-runtime",()=>({getWebSql:()=>sql,getWebUserId:()=>owner}));
const sql=postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",{max:5});
const owner=randomUUID() as UserId;const taskId=randomUUID() as TaskId;const contextId=randomUUID();const projectContextId=randomUUID();
const projectTaskId=randomUUID() as TaskId;const userTaskId=randomUUID() as TaskId;const blockedId=randomUUID() as TaskId;const waitingId=randomUUID() as TaskId;const hardId=randomUUID();
const now=new Date("2026-09-26T09:00:00+09:00");
const fetchSpy=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("External API must not be called"));
beforeAll(async()=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(now);
  await sql`insert into auth.users(id,email,created_at,updated_at) values(${owner},${`home-${owner}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${owner},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode,commitment_level,strategic_importance) values
    (${contextId},${owner},'course','Course','active','not_applicable','REQUIRED',5),
    (${projectContextId},${owner},'project','Project','active','auto',null,null)`;
  await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,importance,status,estimated_user_minutes,completion_criteria,scope_exclusions)
    values
      (${taskId},${owner},${contextId},'Study','standard',3,'PLANNED',30,'Pass explicit check','No visual polish'),
      (${projectTaskId},${owner},${projectContextId},'Project Task','standard',3,'PLANNED',30,'Ship project',null),
      (${userTaskId},${owner},null,'User Task','standard',3,'PLANNED',30,'Finish user task',null),
      (${blockedId},${owner},null,'Blocked Task','standard',5,'BLOCKED',30,null,null),
      (${waitingId},${owner},null,'Waiting Task','standard',5,'WAITING_FOR_USER',30,null,null)`;
});
afterAll(async()=>{vi.useRealTimers();fetchSpy.mockRestore();await sql`delete from auth.users where id=${owner}`;await sql.end();});
describe("Home canonical Chief adapter",()=>{
  it("loads an actionable Main Quest without a Morning plan or workflow",async()=>{
    const before=await sql<{count:number}[]>`select count(*)::int count from public.workflow_runs where user_id=${owner} and workflow_type='chief_outcome_priority'`;
    const home=await loadHomeViewModel();
    expect(home.error).toBeNull();expect(home.configured).toBe(true);expect(home.planState.status).toBe("no_plan");
    expect(home.currentAction).toMatchObject({taskId,title:"Study",context:"Course",completionCriteria:"Pass explicit check",scopeExclusions:"No visual polish"});
    expect(home.currentAction?.taskId).toBe(home.chiefPriority?.mainQuest?.taskId);
    expect(home.nextQuests.map((item)=>item.taskId)).toEqual(home.chiefPriority?.upNext.map((item)=>item.taskId));
    expect(home.nextQuests).toHaveLength(2);expect(home.outcomePriority).toBeNull();
    const selected=[home.chiefPriority?.mainQuest?.taskId,...(home.chiefPriority?.upNext.map((item)=>item.taskId) ?? [])];
    expect(selected).toEqual(expect.arrayContaining([taskId,projectTaskId,userTaskId]));
    expect(selected).not.toContain(blockedId);expect(selected).not.toContain(waitingId);
    expect(home.currentStatus?.priorities.map((item)=>item.taskId)).toEqual(selected);
    expect(Object.keys(home.missionProgress).every((id)=>selected.includes(id))).toBe(true);
    const world=await buildWorldModelSnapshot(sql,owner,"Asia/Seoul",now);
    expect(home.availableMinutes).toBe(world.constraints.todayCapacity.availableMinutes);
    const after=await sql<{count:number}[]>`select count(*)::int count from public.workflow_runs where user_id=${owner} and workflow_type='chief_outcome_priority'`;
    expect(after[0]?.count).toBe(before[0]?.count);expect(canStartHomeQuest(home)).toBe(true);
  });
  it("does not gate the canonical recommendation on pending Morning approval",async()=>{
    await sql`insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,created_by) values(${owner},'2026-09-26','Asia/Seoul',1,'pending_approval','system')`;
    const home=await loadHomeViewModel();
    expect(home.planState.status).toBe("pending_approval");expect(home.currentAction?.taskId).toBe(taskId);expect(home.timeline).toEqual(expect.any(Array));expect(canStartHomeQuest(home)).toBe(true);
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
    const home=await loadHomeViewModel();expect(home.currentAction?.taskId).toBe(hardId);expect(home.currentAction?.whyNow).toBe("오늘 마감이라 지금 처리하는 편이 안전합니다.");
    expect(home.focus?.taskId).toBe(taskId);expect(canStartHomeQuest(home)).toBe(false);
    const after=await sql<{id:string;status:string;task_id:string}[]>`select id,status,task_id from public.focus_sessions where user_id=${owner} and status='active'`;
    expect(after).toEqual(before);expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("reconciles Learning before refreshing canonical Chief Task reality",async()=>{
    const stageId=randomUUID();const materialId=randomUUID();const policyId=randomUUID();
    await sql`insert into public.learning_stages(id,user_id,work_context_id,title,position,status)
      values(${stageId},${owner},${contextId},'Current',1,'ACTIVE')`;
    await sql`insert into public.learning_materials(id,user_id,work_context_id,stage_id,title,material_type,unit_type,total_units,status)
      values(${materialId},${owner},${contextId},${stageId},'DB 교안','slides','LESSON',2,'ACTIVE')`;
    await sql`insert into public.learning_units(user_id,work_context_id,title,position,stage_id,material_id,sequence_no,unit_type)
      values
        (${owner},${contextId},'DB 1',1,${stageId},${materialId},1,'LESSON'),
        (${owner},${contextId},'DB 2',2,${stageId},${materialId},2,'LESSON')`;
    await sql`insert into public.learning_allocation_policies(id,user_id,work_context_id,stage_id,name,profile_type,priority,active)
      values(${policyId},${owner},${contextId},${stageId},'Next lesson','normal',1,true)`;
    await sql`insert into public.learning_allocation_items(user_id,allocation_policy_id,material_id,target_units,estimated_minutes_min,estimated_minutes_max,position,active)
      values(${owner},${policyId},${materialId},1,30,30,1,true)`;

    const home=await loadHomeViewModel();
    const generated=await sql<{id:string;execution_mode:string}[]>`select id,execution_mode from public.tasks
      where user_id=${owner} and work_context_id=${contextId} and title='DB 교안 1강'`;
    expect(generated).toHaveLength(1);
    expect(generated[0]?.execution_mode).toBe("learning_required");
    const selected=[home.chiefPriority?.mainQuest?.taskId,...(home.chiefPriority?.upNext.map((item)=>item.taskId) ?? [])];
    expect(selected).toContain(generated[0]!.id);
    expect(home.learningSpecialist?.activeTaskIds).toContain(generated[0]!.id);
    expect(selected.some((id)=>id?.startsWith("learning:"))).toBe(false);
    expect(home.currentAction?.candidateSource).toBe("task");expect(home.nextQuests.every((item)=>item.candidateSource==="task")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("uses the persisted priorityTaskIds override as Must-do instead of legacy deadline ranking",async()=>{
    await sql`insert into public.strategic_directives(
      user_id,directive,priority_order,scope_id,reason,origin,created_by,confirmation_status,source_reference,valid_from,valid_until
    ) values(${owner},'Study 먼저',${sql.json({kind:"chief_status_override",scope:"TODAY",priorityTaskIds:[taskId],workContextId:null,excludeVideo:false,directMaterialStudy:false})},
      null,'test override','user','user','confirmed',${sql.json({source:"test"})},${now},null)`;
    const home=await loadHomeViewModel();
    expect(home.currentAction).toMatchObject({taskId,reasonCodes:["USER_MUST_DO"],whyNow:"오늘 꼭 하기로 지정한 Task라서 가장 먼저 둡니다."});
    expect(home.chiefPriority?.mainQuest?.evidence.mustDo).toBe(true);
    const legacyRuns=await sql<{count:number}[]>`select count(*)::int count from public.workflow_runs where user_id=${owner} and workflow_type='chief_outcome_priority'`;
    expect(legacyRuns[0]?.count).toBe(0);expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("refreshes Home from canonical reality after completing the active Main Quest",async()=>{
    const before=await loadHomeViewModel();
    expect(before.currentAction?.taskId).toBe(taskId);
    const formData=new FormData();formData.set("command","완료");
    const outcome=await runFocusAction({status:"idle",message:""},formData);
    expect(outcome.status).toBe("success");

    const after=await loadHomeViewModel();
    const [task]=await sql<{status:string;actual_minutes:number}[]>`select status,actual_minutes from public.tasks where id=${taskId}`;
    const selected=[after.chiefPriority?.mainQuest?.taskId,...(after.chiefPriority?.upNext.map((item)=>item.taskId) ?? [])];
    const early=await sql<{count:number}[]>`select count(*)::int count from public.domain_events
      where user_id=${owner} and event_type='replan_triggered' and payload->>'reason'='task_completed_early'`;
    const legacy=await sql<{count:number}[]>`select count(*)::int count from public.workflow_runs
      where user_id=${owner} and workflow_type='chief_outcome_priority'`;
    expect(task).toEqual({status:"DONE",actual_minutes:0});
    expect(selected).not.toContain(taskId);
    expect(after.currentAction?.taskId).toBe(after.chiefPriority?.mainQuest?.taskId);
    expect(after.nextQuests.map((item)=>item.taskId)).toEqual(after.chiefPriority?.upNext.map((item)=>item.taskId));
    expect(early[0]?.count).toBe(0);expect(legacy[0]?.count).toBe(0);expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("recalculates future feasibility after a real Home completion without moving plan time",async()=>{
    const clearHard=new FormData();clearHard.set("taskId",hardId);
    expect((await completeHomeQuestAction({status:"idle",message:""},clearHard)).status).toBe("success");
    const a=randomUUID();const b=randomUUID();const c=randomUUID();
    const deadline=new Date("2026-09-27T18:00:00+09:00");
    await sql`insert into public.tasks(id,user_id,title,execution_mode,importance,status,estimated_user_minutes,official_deadline)
      values
        (${a},${owner},'Outcome A','standard',5,'PLANNED',300,${deadline}),
        (${b},${owner},'Future B','standard',5,'PLANNED',600,${deadline}),
        (${c},${owner},'Future C','standard',4,'PLANNED',500,${deadline})`;
    await sql`insert into public.strategic_directives(
      user_id,directive,priority_order,scope_id,reason,origin,created_by,confirmation_status,source_reference,valid_from,valid_until
    ) values(${owner},'Outcome A 먼저',${sql.json({kind:"chief_status_override",scope:"TODAY",priorityTaskIds:[a],workContextId:null,excludeVideo:false,directMaterialStudy:false})},
      null,'outcome refresh test','user','user','confirmed',${sql.json({source:"test"})},${now},null)`;

    const before=await loadHomeViewModel();
    const beforeChoices=[before.chiefPriority?.mainQuest,...(before.chiefPriority?.upNext ?? [])];
    const beforeB=beforeChoices.find((choice)=>choice?.taskId===b);
    expect(before.currentAction?.taskId).toBe(a);expect(beforeB?.evidence.deadlineState).toBe("FUTURE_CAPACITY_DEFICIT");
    const completeA=new FormData();completeA.set("taskId",a);
    expect((await completeHomeQuestAction({status:"idle",message:""},completeA)).status).toBe("success");
    const after=await loadHomeViewModel();
    const afterChoices=[after.chiefPriority?.mainQuest,...(after.chiefPriority?.upNext ?? [])];
    const afterB=afterChoices.find((choice)=>choice?.taskId===b);
    const selected=afterChoices.flatMap((choice)=>choice ? [choice.taskId] : []);
    expect(selected).not.toContain(a);expect(selected).toEqual(expect.arrayContaining([b,c]));
    expect(after.currentAction?.taskId).toBe(after.chiefPriority?.mainQuest?.taskId);
    expect(afterB?.evidence.capacitySlackMinutes).toBe((beforeB?.evidence.capacitySlackMinutes ?? 0)+300);
    expect(afterB?.evidence.deadlineState).toBe("FUTURE_CAPACITY_DEFICIT");
    const legacy=await sql<{count:number}[]>`select count(*)::int count from public.workflow_runs
      where user_id=${owner} and workflow_type='chief_outcome_priority'`;
    expect(legacy[0]?.count).toBe(0);expect(fetchSpy).not.toHaveBeenCalled();

    for(const id of [b,c]){const form=new FormData();form.set("taskId",id);await completeHomeQuestAction({status:"idle",message:""},form);}
  });
  it("reconciles the next canonical Learning Task after a real Home completion",async()=>{
    const [current]=await sql<{id:string}[]>`select id from public.tasks
      where user_id=${owner} and execution_mode='learning_required' and status<>'DONE' order by created_at limit 1`;
    expect(current).toBeDefined();
    const before=await loadHomeViewModel();expect(before.currentAction?.taskId).toBe(current!.id);
    const formData=new FormData();formData.set("taskId",current!.id);
    expect((await completeHomeQuestAction({status:"idle",message:""},formData)).status).toBe("success");
    const after=await loadHomeViewModel();
    const learningTasks=await sql<{id:string;status:string}[]>`select id,status from public.tasks
      where user_id=${owner} and execution_mode='learning_required' order by created_at,id`;
    const selected=[after.chiefPriority?.mainQuest?.taskId,...(after.chiefPriority?.upNext.map((item)=>item.taskId) ?? [])];
    const next=learningTasks.find((task)=>task.id!==current!.id && task.status!=="DONE");
    expect(learningTasks.find((task)=>task.id===current!.id)?.status).toBe("DONE");
    expect(next).toBeDefined();expect(selected).toContain(next!.id);
    expect(selected.some((id)=>id?.startsWith("learning:"))).toBe(false);
    expect(after.currentAction?.taskId).toBe(after.chiefPriority?.mainQuest?.taskId);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
