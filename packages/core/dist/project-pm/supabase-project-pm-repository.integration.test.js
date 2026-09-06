import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseChiefRunRecorder } from "../chief/supabase-chief-context-reader.js";
import { AgentBootstrapService } from "../agent-execution/agent-bootstrap.js";
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
const otherGlobalScopeId = randomUUID();
const taskId = randomUUID();
const otherTaskId = randomUUID();
const foreignTaskId = randomUUID();
const objectiveId = randomUUID();
const goalId = randomUUID();
const planId = randomUUID();
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
      (${otherGlobalScopeId},${otherUserId},'global','Global'),
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
});
afterAll(async () => {
    await sql `delete from auth.users where id in (${userId},${otherUserId})`;
    await sql.end();
});
describe("SupabaseProjectPmRepository", () => {
    it("bootstraps built-in instances idempotently by user, type, and scope", async () => {
        const bootstrap = new AgentBootstrapService(sql);
        const [chiefA, chiefRetry, pmA, pmConcurrent] = await Promise.all([
            bootstrap.ensureAgentInstance(userId, "chief"),
            bootstrap.ensureAgentInstance(userId, "chief"),
            bootstrap.ensureAgentInstance(userId, "project_pm", scopeId),
            bootstrap.ensureAgentInstance(userId, "project_pm", scopeId)
        ]);
        const otherChief = await bootstrap.ensureAgentInstance(otherUserId, "chief");
        expect(chiefA?.id).toBe(chiefRetry?.id);
        expect(pmA?.id).toBe(pmConcurrent?.id);
        expect(chiefA?.id).not.toBe(pmA?.id);
        expect(otherChief?.id).not.toBe(chiefA?.id);
        const counts = await sql `
      select i.user_id,t.template_key,count(*)::int count from public.agent_instances i
      join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
      where i.user_id in (${userId},${otherUserId}) and i.status='active'
      group by i.user_id,t.template_key order by i.user_id,t.template_key
    `;
        expect(counts).toEqual(expect.arrayContaining([
            { user_id: userId, template_key: "chief", count: 1 },
            { user_id: userId, template_key: "project_pm", count: 1 },
            { user_id: otherUserId, template_key: "chief", count: 1 }
        ]));
    });
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
        await sql `delete from public.agent_instances where user_id=${userId}`;
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
        (select count(*)::int from public.agent_runs r join public.agent_instances i on i.id=r.agent_instance_id
          join public.agent_templates t on t.id=i.agent_template_id
          where r.user_id=${userId} and t.template_key='project_pm') run_count,
        (select count(*)::int from public.context_packages where user_id=${userId} and source_refs->>'triggerId'=${input.triggerId}) package_count,
        (select count(*)::int from public.artifacts where user_id=${userId} and artifact_type='project_pm_response') artifact_count,
        exists(select 1 from public.context_packages where user_id=${userId} and scope_id=${scopeId}
          and source_refs->>'triggerId'=${input.triggerId}) scope_matches,
        (select count(*)::int from public.context_packages where user_id=${userId}
          and source_refs->>'correlationId'=${input.correlationId}) correlated_runs
    `;
        expect(rows[0]).toEqual({ run_count: 1, package_count: 1, artifact_count: 1, scope_matches: true, correlated_runs: 2 });
        const bootstrapped = await sql `
      select t.template_key,i.home_scope_id,count(*)::int count from public.agent_instances i
      join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
      where i.user_id=${userId} and i.status='active' group by t.template_key,i.home_scope_id order by t.template_key
    `;
        expect(bootstrapped).toEqual([
            { template_key: "chief", home_scope_id: globalScopeId, count: 1 },
            { template_key: "project_pm", home_scope_id: scopeId, count: 1 }
        ]);
    });
});
//# sourceMappingURL=supabase-project-pm-repository.integration.test.js.map