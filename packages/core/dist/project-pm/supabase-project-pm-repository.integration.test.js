import { randomUUID } from "node:crypto";
import { FixedClock } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SupabaseChiefRunRecorder } from "../chief/supabase-chief-context-reader.js";
import { AgentBootstrapService } from "../agent-execution/agent-bootstrap.js";
import { ProjectLeadershipService } from "../project-leadership/project-leadership-service.js";
import { BacklogApprovalService } from "../project-leadership/backlog-approval-service.js";
import { SupabaseProjectLeadershipRepository } from "../project-leadership/supabase-project-leadership-repository.js";
import { SupabaseBacklogApprovalRepository } from "../project-leadership/supabase-backlog-approval-repository.js";
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
const objectiveTaskId = randomUUID();
const otherTaskId = randomUUID();
const foreignTaskId = randomUUID();
const objectiveId = randomUUID();
const goalId = randomUUID();
const planId = randomUUID();
const sourceArtifactId = randomUUID();
const otherArtifactId = randomUUID();
const projectDecisionId = randomUUID();
const otherDecisionId = randomUUID();
const projectReferenceId = randomUUID();
const otherReferenceId = randomUUID();
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
      (${objectiveTaskId},${userId},null,${objectiveId},'Objective 경유 작업','standard',20,4,'PLANNED'),
      (${otherTaskId},${userId},${otherProjectId},null,'다른 프로젝트 일','standard',30,4,'PLANNED'),
      (${foreignTaskId},${otherUserId},${foreignProjectId},null,'다른 사용자 일','standard',30,4,'PLANNED')
  `;
    await sql `
    insert into public.task_steps(user_id,task_id,position,title,owner,status) values
      (${userId},${objectiveTaskId},1,'경유 작업 검증','user','pending')
  `;
    await sql `
    insert into public.artifacts(id,user_id,artifact_type,title,work_context_id,content_text,content_hash) values
      (${sourceArtifactId},${userId},'spec','LogFolio 명세',${projectId},'명세 내용','hash-project'),
      (${otherArtifactId},${userId},'spec','NEXTiME 명세',${otherProjectId},'다른 내용','hash-other')
  `;
    await sql `
    insert into public.decisions(id,user_id,question,why_now,options,ai_recommendation,impact,status,created_at) values
      (${projectDecisionId},${userId},'LogFolio 범위','출시 준비','{}','{}',${sql.json({ context: { projectId } })},'resolved',now()),
      (${otherDecisionId},${userId},'NEXTiME 범위','다른 프로젝트','{}','{}',${sql.json({ context: { projectId: otherProjectId } })},'resolved',now())
  `;
    await sql `
    insert into public.external_references(id,user_id,source,external_type,external_id,external_version,ownership,content_hash,
      internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at) values
      (${projectReferenceId},${userId},'github','repository','logfolio',null,'external',null,'work_context',${projectId},'active',now(),now()),
      (${otherReferenceId},${userId},'github','repository','nextime','v1','external','other-hash','work_context',${otherProjectId},'active',now(),now())
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
    values
      (${userId},'task_started','task',${taskId},'user','2026-09-06T01:00:00Z',${randomUUID()},1,'{}'),
      (${userId},'task_planned','task',${objectiveTaskId},'system','2026-09-06T00:30:00Z',${randomUUID()},1,'{}'),
      (${userId},'task_planned','task',${otherTaskId},'system','2026-09-06T00:20:00Z',${randomUUID()},1,'{}')
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
        expect(context.tasks.map((item) => item.title).sort()).toEqual(["Objective 경유 작업", "발표 수정"].sort());
        expect(context.objectives.map((item) => item.title)).toEqual(["출시"]);
        expect(context.goals.map((item) => item.title)).toEqual(["포트폴리오"]);
        expect(context.approvedPlanTasks.map((item) => item.taskId)).toEqual([taskId]);
        expect(context.activeFocus?.taskId).toBe(taskId);
        expect(context.taskSteps.map((item) => item.taskId)).toEqual([objectiveTaskId]);
        expect(context.artifacts.map((item) => item.id)).toEqual([sourceArtifactId]);
        expect(context.decisions.map((item) => item.id)).toEqual([projectDecisionId]);
        expect(context.sourceReferences.map((item) => item.id)).toEqual([projectReferenceId]);
        expect(context.recentEvents.map((item) => item.aggregateId)).toEqual([taskId, objectiveTaskId]);
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
    it("persists the project observation loop without mutating canonical work", async () => {
        const before = await sql `
      select
        (select count(*)::int from public.tasks where user_id=${userId}) tasks,
        (select count(*)::int from public.task_steps where user_id=${userId}) steps,
        (select count(*)::int from public.objectives where user_id=${userId}) objectives
    `;
        const analysisProvider = {
            reviewProjectState: vi.fn(async () => ({
                gaps: [{
                        key: "missing-criteria", title: "완료 기준 부족", description: "출시 기준을 보강해야 함",
                        evidenceRefs: [`task:${taskId}`], priorityHint: "high", confidence: 0.9, blocking: true,
                        rationale: "현재 진행 중 작업만으로 출시 판정이 어려움"
                    }],
                unknowns: ["GitHub source revision unknown"]
            })),
            refineBacklog: vi.fn(async () => ({
                items: [
                    { key: "human-item", sourceGapKey: "missing-criteria", objectiveId, title: "사용자 확인", description: "사용자가 기준을 확인한다", suggestedPriority: "medium", suggestedOwner: "human", acceptanceCriteria: ["확인 완료"], dependencies: [], roughSize: "s", evidenceRefs: ["gap:missing-criteria", `task:${taskId}`], risk: null },
                    { key: "ai-item", sourceGapKey: "missing-criteria", objectiveId, title: "AI 초안", description: "AI가 초안을 준비한다", suggestedPriority: "high", suggestedOwner: "human", acceptanceCriteria: ["초안 존재"], dependencies: [], roughSize: "m", evidenceRefs: ["gap:missing-criteria"], risk: null },
                    { key: "hybrid-item", sourceGapKey: "missing-criteria", objectiveId, title: "혼합 검토", description: "AI 초안 후 사용자가 검토한다", suggestedPriority: "high", suggestedOwner: "hybrid", acceptanceCriteria: ["검토 완료"], dependencies: [], roughSize: "m", evidenceRefs: ["gap:missing-criteria"], risk: null },
                    { key: "excluded-item", sourceGapKey: "missing-criteria", objectiveId, title: "제외할 일", description: "이번 범위에서 제외한다", suggestedPriority: "low", suggestedOwner: "human", acceptanceCriteria: ["제외 판단"], dependencies: [], roughSize: "xs", evidenceRefs: ["gap:missing-criteria"], risk: null }
                ],
                unknowns: []
            }))
        };
        const subject = new ProjectLeadershipService({
            projectRepository: repository,
            workflowRepository: new SupabaseProjectLeadershipRepository(sql),
            analysisProvider,
            clock: new FixedClock(new Date("2026-09-09T03:00:00.000Z"))
        });
        const request = { userId, workContextId: projectId, timeZone: "Asia/Seoul", idempotencyKey: `project-leadership:${projectId}:wave-1` };
        const first = await subject.run(request);
        const retry = await subject.run(request);
        expect(retry).toEqual(first);
        expect(analysisProvider.reviewProjectState).toHaveBeenCalledTimes(1);
        expect(analysisProvider.refineBacklog).toHaveBeenCalledTimes(1);
        expect(first.backlogProposal.content.sourceSnapshotArtifactId).toBe(first.snapshot.id);
        expect(first.backlogProposal.content.sourceGapAnalysisArtifactId).toBe(first.gapAnalysis.id);
        const persisted = await sql `
      select artifact_type,work_context_id,content_hash from public.artifacts
      where user_id=${userId} and artifact_type in ('project_state_snapshot','gap_analysis','backlog_proposal')
      order by created_at
    `;
        expect(persisted).toHaveLength(3);
        expect(persisted.every((item) => item.work_context_id === projectId && item.content_hash.length === 64)).toBe(true);
        const traces = await sql `
      select w.status,w.current_step,w.checkpoint_version,c.work_context_id,
        (select count(*)::int from public.context_packages p where p.user_id=w.user_id and p.id=c.id) package_count
      from public.workflow_runs w
      join public.context_packages c on c.id=(w.checkpoint_state->>'contextPackageId')::uuid and c.user_id=w.user_id
      where w.id=${first.workflowRunId} and w.user_id=${userId}
    `;
        expect(traces[0]).toEqual({ status: "completed", current_step: "COMPLETE", checkpoint_version: 3, work_context_id: projectId, package_count: 1 });
        const after = await sql `
      select
        (select count(*)::int from public.tasks where user_id=${userId}) tasks,
        (select count(*)::int from public.task_steps where user_id=${userId}) steps,
        (select count(*)::int from public.objectives where user_id=${userId}) objectives
    `;
        expect(after).toEqual(before);
        const otherArtifacts = await sql `
      select count(*)::int count from public.artifacts where user_id=${userId} and work_context_id=${otherProjectId}
        and artifact_type in ('project_state_snapshot','gap_analysis','backlog_proposal')
    `;
        expect(otherArtifacts[0]?.count).toBe(0);
        const approvalService = new BacklogApprovalService({
            repository: new SupabaseBacklogApprovalRepository(sql), projectRepository: repository,
            clock: new FixedClock(new Date("2026-09-09T04:00:00.000Z"))
        });
        const approval = await approvalService.requestApproval({
            userId, proposalArtifactId: first.backlogProposal.id, proposalHash: first.backlogProposal.contentHash,
            idempotencyKey: `backlog-approval:${first.backlogProposal.id}`
        });
        const beforeDecision = await sql `
      select (select count(*)::int from public.tasks where user_id=${userId}) tasks,
        (select count(*)::int from public.task_steps where user_id=${userId}) steps
    `;
        expect(beforeDecision).toEqual(after.map(({ tasks, steps }) => ({ tasks, steps })));
        const decision = {
            userId,
            approvalRequestId: approval.id,
            proposalArtifactId: first.backlogProposal.id,
            proposalHash: first.backlogProposal.contentHash,
            acceptedItems: [
                { proposalItemKey: "human-item", priorityOverride: "critical" },
                { proposalItemKey: "ai-item", ownerOverride: "ai" },
                { proposalItemKey: "hybrid-item" }
            ],
            excludedItems: [{ proposalItemKey: "excluded-item", reason: "현재 범위 밖" }],
            userReason: "출시에 필요한 세 항목만 먼저 처리"
        };
        const materialized = await approvalService.decide(decision, "Asia/Seoul");
        const duplicate = await approvalService.decide(decision, "Asia/Seoul");
        expect(duplicate.duplicate).toBe(true);
        expect(duplicate.tasks).toEqual(materialized.tasks);
        expect(materialized.excludedItemKeys).toEqual(["excluded-item"]);
        expect(materialized.tasks.map((item) => item.proposalItemKey).sort()).toEqual(["ai-item", "human-item", "hybrid-item"]);
        expect(materialized.tasks.find((item) => item.proposalItemKey === "human-item")).toMatchObject({
            importance: 5, steps: [{ owner: "user", route: "human_executable" }]
        });
        expect(materialized.tasks.find((item) => item.proposalItemKey === "ai-item")?.steps).toEqual([
            expect.objectContaining({ owner: "ai", route: "ai_executable" })
        ]);
        expect(materialized.tasks.find((item) => item.proposalItemKey === "hybrid-item")?.steps).toEqual([
            expect.objectContaining({ position: 1, owner: "ai", route: "ai_executable" }),
            expect.objectContaining({ position: 2, owner: "user", route: "dependency_waiting" })
        ]);
        const excluded = await sql `
      select count(*)::int count from public.tasks where user_id=${userId} and title='제외할 일'
    `;
        expect(excluded[0]?.count).toBe(0);
        const trace = await sql `
      select a.status approval_status,f.user_reason decision_reason,
        (select count(*)::int from public.domain_events e where e.user_id=a.user_id and e.workflow_run_id=a.workflow_run_id and e.event_type='task_created') task_events,
        (select count(*)::int from public.domain_events e where e.user_id=a.user_id and e.workflow_run_id=a.workflow_run_id and e.event_type='task_step_created') step_events,
        (select count(*)::int from public.domain_events e where e.user_id=a.user_id and e.workflow_run_id=a.workflow_run_id and e.causation_id is not null) causal_events
      from public.approval_requests a join public.decision_feedback f on f.decision_id=a.decision_id and f.user_id=a.user_id
      where a.id=${approval.id} and a.user_id=${userId}
    `;
        expect(trace[0]).toEqual({ approval_status: "approved", decision_reason: decision.userReason, task_events: 3, step_events: 4, causal_events: 8 });
        const laterLeadership = new ProjectLeadershipService({
            projectRepository: repository,
            workflowRepository: new SupabaseProjectLeadershipRepository(sql),
            analysisProvider,
            clock: new FixedClock(new Date("2026-09-09T05:00:00.000Z"))
        });
        const later = await laterLeadership.run({
            userId, workContextId: projectId, timeZone: "Asia/Seoul", idempotencyKey: `project-leadership:${projectId}:stale-case`
        });
        const staleApproval = await approvalService.requestApproval({
            userId, proposalArtifactId: later.backlogProposal.id, proposalHash: later.backlogProposal.contentHash,
            idempotencyKey: `backlog-approval:${later.backlogProposal.id}`
        });
        const taskCountBeforeStale = await sql `
      select count(*)::int count from public.tasks where user_id=${userId}
    `;
        await sql `update public.tasks set title='발표 수정됨',updated_at=now() where id=${taskId} and user_id=${userId}`;
        await expect(approvalService.decide({
            userId,
            approvalRequestId: staleApproval.id,
            proposalArtifactId: later.backlogProposal.id,
            proposalHash: later.backlogProposal.contentHash,
            acceptedItems: later.backlogProposal.content.items.map((item) => ({ proposalItemKey: item.key })),
            excludedItems: []
        }, "Asia/Seoul")).rejects.toMatchObject({ code: "CONFLICT" });
        const staleState = await sql `
      select a.status,(select count(*)::int from public.tasks where user_id=${userId}) task_count
      from public.approval_requests a where a.id=${staleApproval.id} and a.user_id=${userId}
    `;
        expect(staleState[0]).toEqual({ status: "expired", task_count: taskCountBeforeStale[0].count });
        const otherProjectState = await sql `
      select count(*)::int count,min(title) title from public.tasks where user_id=${userId} and work_context_id=${otherProjectId}
    `;
        expect(otherProjectState[0]).toEqual({ count: 1, title: "다른 프로젝트 일" });
    });
});
//# sourceMappingURL=supabase-project-pm-repository.integration.test.js.map