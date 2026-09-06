import { SupabaseAgentRunRecorder } from "../agent-execution/supabase-agent-run-recorder.js";
const mapProject = (row) => ({
    id: row.id, userId: row.user_id, scopeId: row.scope_id, title: row.title, description: row.description,
    status: row.status, startDate: row.start_date, endDate: row.end_date
});
const mapTask = (row) => ({
    id: row.id, userId: row.user_id, workContextId: row.work_context_id,
    objectiveId: row.objective_id, title: row.title, description: row.description,
    executionMode: row.execution_mode, officialDeadline: row.official_deadline,
    internalDeadline: row.internal_deadline, estimatedMinutes: row.estimated_minutes,
    estimatedUserMinutes: row.estimated_user_minutes, actualMinutes: row.actual_minutes, importance: row.importance,
    status: row.status, nextAction: row.next_action, completionCriteria: row.completion_criteria,
    completionSource: row.completion_source, createdAt: row.created_at, completedAt: row.completed_at, updatedAt: row.updated_at
});
export class SupabaseProjectPmRepository {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async listProjects(userId) {
        const rows = await this.sql `
      select id,user_id,scope_id,title,description,status,start_date::text,end_date::text from public.work_contexts
      where user_id=${userId} and kind='project' and archived_at is null order by title
    `;
        return rows.map(mapProject);
    }
    async loadProjectContext(userId, project, planDate, timeZone, now) {
        const projects = await this.sql `
      select id,user_id,scope_id,title,description,status,start_date::text,end_date::text from public.work_contexts
      where id=${project.id} and user_id=${userId} and kind='project' and archived_at is null
    `;
        if (!projects[0])
            throw new Error("Project WorkContext disappeared");
        const [objectives, goals, tasks, focus, planTasks, events] = await Promise.all([
            this.sql `
        select id,title,goal_id,target_date::text,importance,status from public.objectives
        where user_id=${userId} and work_context_id=${project.id} and status='active' order by importance desc,created_at
      `,
            this.sql `
        select distinct g.id,g.title,g.status from public.goals g join public.objectives o on o.goal_id=g.id and o.user_id=g.user_id
        where g.user_id=${userId} and o.work_context_id=${project.id} order by g.title
      `,
            this.sql `select * from public.tasks where user_id=${userId} and work_context_id=${project.id} order by created_at`,
            this.sql `
        select f.id session_id,f.task_id,t.title,f.started_at from public.focus_sessions f
        join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
        where f.user_id=${userId} and f.status='active' and t.work_context_id=${project.id}
        order by f.started_at desc limit 1
      `,
            this.sql `
        select i.task_id,i.position from public.daily_plans p join public.plan_items i on i.daily_plan_id=p.id and i.user_id=p.user_id
        join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
        where p.user_id=${userId} and p.plan_date=${planDate} and p.status='approved'
          and i.item_type='task' and t.work_context_id=${project.id} and i.status not in ('completed','cancelled','skipped')
        order by p.revision_no desc,i.position
      `,
            this.sql `
        select id,event_type,aggregate_type,aggregate_id,occurred_at from public.domain_events e
        where e.user_id=${userId} and (
          e.aggregate_id=${project.id}
          or e.aggregate_id in (select id from public.tasks where user_id=${userId} and work_context_id=${project.id})
          or e.aggregate_id in (select id from public.objectives where user_id=${userId} and work_context_id=${project.id})
        ) order by occurred_at desc,recorded_at desc limit 20
      `
        ]);
        return {
            userId, project: mapProject(projects[0]), observedAt: now, planDate, timeZone,
            objectives: objectives.map((item) => ({
                id: item.id, title: item.title, goalId: item.goal_id, targetDate: item.target_date,
                importance: item.importance, status: item.status
            })),
            goals: goals.map((item) => ({ id: item.id, title: item.title, status: item.status })),
            tasks: tasks.map(mapTask),
            activeFocus: focus[0] ? {
                sessionId: focus[0].session_id, taskId: focus[0].task_id, title: focus[0].title, startedAt: focus[0].started_at
            } : null,
            approvedPlanTasks: planTasks.map((item) => ({ taskId: item.task_id, position: item.position })),
            recentEvents: events.map((item) => ({
                id: item.id, eventType: item.event_type, aggregateType: item.aggregate_type,
                aggregateId: item.aggregate_id, occurredAt: item.occurred_at
            }))
        };
    }
}
export class SupabaseProjectPmRunRecorder {
    recorder;
    constructor(sql) {
        this.recorder = new SupabaseAgentRunRecorder(sql);
    }
    findCompleted(userId, triggerId) {
        return this.recorder.findCompleted(userId, "project_pm", "project_pm_response", triggerId);
    }
    async recordCompleted(input) {
        if (!input.context.project.scopeId)
            return;
        await this.recorder.recordCompleted({
            userId: input.context.userId,
            agentTemplateKey: "project_pm",
            artifactType: "project_pm_response",
            triggerId: input.triggerId,
            source: input.source,
            requestKind: input.requestKind,
            contextPayload: {
                projectId: input.context.project.id,
                objectiveIds: input.context.objectives.map((item) => item.id),
                goalIds: input.context.goals.map((item) => item.id),
                taskIds: input.context.tasks.map((item) => item.id),
                activeFocusId: input.context.activeFocus?.sessionId ?? null,
                approvedPlanTaskIds: input.context.approvedPlanTasks.map((item) => item.taskId),
                recentEventIds: input.context.recentEvents.map((item) => item.id),
                nextTaskId: input.nextTaskId
            },
            reply: input.reply,
            policyVersion: "project-pm-v0.1",
            startedAt: input.startedAt,
            completedAt: input.completedAt,
            ...(input.correlationId ? { correlationId: input.correlationId } : {}),
            requiredScopeId: input.context.project.scopeId
        });
    }
}
//# sourceMappingURL=supabase-project-pm-repository.js.map