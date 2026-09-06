import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseChiefRunRecorder } from "../chief/supabase-chief-context-reader.js";
import { SupabaseProjectPmRepository, SupabaseProjectPmRunRecorder } from "./supabase-project-pm-repository.js";
const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userId = randomUUID();
const otherUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const foreignProjectId = randomUUID();
const courseId = randomUUID();
const scopeId = randomUUID();
const globalScopeId = randomUUID();
const otherScopeId = randomUUID();
const foreignScopeId = randomUUID();
const taskId = randomUUID();
const otherTaskId = randomUUID();
const foreignTaskId = randomUUID();
const objectiveId = randomUUID();
const goalId = randomUUID();
const planId = randomUUID();
const templateId = randomUUID();
const instanceId = randomUUID();
const chiefTemplateId = randomUUID();
const chiefInstanceId = randomUUID();
const repository = new SupabaseProjectPmRepository(sql);
beforeAll(async () => {
    await sql `
    insert into auth.users(id,email,created_at,updated_at) values
      (${userId},${`project-pm-${userId}@example.test`},now(),now()),
      (${otherUserId},${`project-pm-${otherUserId}@example.test`},now(),now())
  `;
    await sql `insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${otherUserId},'Asia/Seoul')`;
    await sql `
    insert into public.scopes(id,user_id,kind,label) values
      (${globalScopeId},${userId},'global','Global'),
      (${scopeId},${userId},'work_context','LogFolio'),
      (${otherScopeId},${userId},'work_context','NEXTiME'),
      (${foreignScopeId},${otherUserId},'work_context','Foreign')
  `;
    await sql `
    insert into public.work_contexts(id,user_id,scope_id,kind,title,status,agent_mode) values
      (${projectId},${userId},${scopeId},'project','LogFolio','active','auto'),
      (${otherProjectId},${userId},${otherScopeId},'project','NEXTiME','active','auto'),
      (${courseId},${userId},${scopeId},'course','Database','active','not_applicable'),
      (${foreignProjectId},${otherUserId},${foreignScopeId},'project','Foreign','active','auto')
  `;
    await sql `insert into public.goals(id,user_id,scope_id,title,importance,status,origin) values(${goalId},${userId},${scopeId},'포트폴리오',5,'active','user')`;
    await sql `
    insert into public.objectives(id,user_id,scope_id,goal_id,work_context_id,title,importance,status,origin) values
      (${objectiveId},${userId},${scopeId},${goalId},${projectId},'출시',5,'active','user')
  `;
    await sql `
    insert into public.tasks(id,user_id,work_context_id,objective_id,title,execution_mode,estimated_minutes,importance,status) values
      (${taskId},${userId},${projectId},${objectiveId},'발표 수정','standard',45,5,'IN_PROGRESS'),
      (${otherTaskId},${userId},${otherProjectId},null,'다른 프로젝트 일','standard',30,4,'PLANNED'),
      (${foreignTaskId},${otherUserId},${foreignProjectId},null,'다른 사용자 일','standard',30,4,'PLANNED')
  `;
    await sql `
    insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,created_by)
    values(${planId},${userId},'2026-09-06','Asia/Seoul',1,'pending_approval','test')
  `;
    await sql `
    insert into public.plan_items(user_id,daily_plan_id,position,item_type,task_id,planned_minutes,status)
    values(${userId},${planId},1,'task',${taskId},45,'planned')
  `;
    await sql `update public.daily_plans set status='approved',approved_at=now() where id=${planId} and user_id=${userId}`;
    await sql `
    insert into public.focus_sessions(user_id,task_id,status,started_at)
    values(${userId},${taskId},'active','2026-09-06T01:00:00Z')
  `;
    await sql `
    insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,payload_version,payload)
    values(${userId},'task_started','task',${taskId},'user','2026-09-06T01:00:00Z',${randomUUID()},1,'{}')
  `;
    await sql `
    insert into public.agent_templates(id,user_id,template_key,version,name,role,instructions,active)
    values
      (${templateId},${userId},'project_pm','1','Project PM','project_pm','read only',true),
      (${chiefTemplateId},${userId},'chief','1','Chief','chief','delegate only',true)
  `;
    await sql `
    insert into public.agent_instances(id,user_id,agent_template_id,template_version,name,home_scope_id,status)
    values
      (${instanceId},${userId},${templateId},'1','LogFolio PM',${scopeId},'active'),
      (${chiefInstanceId},${userId},${chiefTemplateId},'1','Chief',${globalScopeId},'active')
  `;
});
afterAll(async () => {
    await sql `delete from auth.users where id in (${userId},${otherUserId})`;
    await sql.end();
});
describe("SupabaseProjectPmRepository", () => {
    it("loads only project WorkContexts and keeps project facts isolated by user and project", async () => {
        const projects = await repository.listProjects(userId);
        expect(projects.map((item) => item.title)).toEqual(["LogFolio", "NEXTiME"]);
        const selected = projects.find((item) => item.id === projectId);
        const context = await repository.loadProjectContext(userId, selected, "2026-09-06", "Asia/Seoul", new Date("2026-09-06T03:00:00Z"));
        expect(context.tasks.map((item) => item.title)).toEqual(["발표 수정"]);
        expect(context.objectives.map((item) => item.title)).toEqual(["출시"]);
        expect(context.goals.map((item) => item.title)).toEqual(["포트폴리오"]);
        expect(context.approvedPlanTasks.map((item) => item.taskId)).toEqual([taskId]);
        expect(context.activeFocus?.taskId).toBe(taskId);
        expect(context.recentEvents.map((item) => item.aggregateId)).toEqual([taskId]);
        expect(context.tasks.some((item) => item.title.includes("다른"))).toBe(false);
    });
    it("records one scoped agent execution trace idempotently", async () => {
        const selected = (await repository.listProjects(userId)).find((item) => item.id === projectId);
        const context = await repository.loadProjectContext(userId, selected, "2026-09-06", "Asia/Seoul", new Date("2026-09-06T03:00:00Z"));
        const recorder = new SupabaseProjectPmRunRecorder(sql);
        const input = {
            context,
            requestKind: "status",
            triggerId: "discord:project-pm-trace",
            source: "discord",
            reply: "LogFolio 현황",
            nextTaskId: taskId,
            correlationId: "chief-delegation:integration",
            startedAt: new Date("2026-09-06T03:00:00Z"),
            completedAt: new Date("2026-09-06T03:00:01Z")
        };
        await recorder.recordCompleted(input);
        await recorder.recordCompleted(input);
        await expect(recorder.findCompleted(userId, input.triggerId)).resolves.toBe(input.reply);
        await new SupabaseChiefRunRecorder(sql).recordDelegationCompleted({
            userId,
            triggerId: "discord:chief-trace",
            source: "discord",
            correlationId: input.correlationId,
            report: {
                project: { id: projectId, title: "LogFolio" },
                status: { open: 1, done: 0, inProgress: 1, blocked: 0, overdue: 0, dueSoon: 0 },
                nextAction: { taskId, title: "발표 수정", remainingMinutes: 45 },
                blockers: [],
                nearestDeadline: null,
                warnings: []
            },
            reply: "LogFolio PM에게 확인했어.",
            startedAt: input.startedAt,
            completedAt: input.completedAt
        });
        const rows = await sql `
      select
        (select count(*)::int from public.agent_runs where user_id=${userId} and agent_instance_id=${instanceId}) run_count,
        (select count(*)::int from public.context_packages where user_id=${userId} and source_refs->>'triggerId'=${input.triggerId}) package_count,
        (select count(*)::int from public.artifacts where user_id=${userId} and artifact_type='project_pm_response') artifact_count,
        exists(select 1 from public.context_packages where user_id=${userId} and scope_id=${scopeId}
          and source_refs->>'triggerId'=${input.triggerId}) scope_matches,
        (select count(*)::int from public.context_packages where user_id=${userId}
          and source_refs->>'correlationId'=${input.correlationId}) correlated_runs
    `;
        expect(rows[0]).toEqual({ run_count: 1, package_count: 1, artifact_count: 1, scope_matches: true, correlated_runs: 2 });
    });
});
//# sourceMappingURL=supabase-project-pm-repository.integration.test.js.map