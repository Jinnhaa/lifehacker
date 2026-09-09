import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { SupabaseAgentRunRecorder } from "../agent-execution/supabase-agent-run-recorder.js";
import type { Task, TaskExecutionMode, TaskStatus } from "../task/task.js";
import type {
  ProjectDomainEvent,
  ProjectGoal,
  ProjectObjective,
  ProjectPmContext,
  ProjectPmRepository,
  ProjectPmRunRecorder,
  ProjectWorkContext
} from "./project-pm.js";

interface WorkContextRow {
  id: string; user_id: string; scope_id: string | null; title: string; description: string | null;
  status: string; start_date: string | null; end_date: string | null;
}
interface TaskRow {
  id: string; user_id: string; work_context_id: string | null; objective_id: string | null; title: string;
  description: string | null; execution_mode: string; official_deadline: Date | null; internal_deadline: Date | null;
  estimated_minutes: number | null; estimated_user_minutes: number | null; actual_minutes: number; importance: number;
  status: string; next_action: string | null; completion_criteria: string | null; completion_source: string | null;
  created_at: Date; completed_at: Date | null; updated_at: Date;
}

const mapProject = (row: WorkContextRow): ProjectWorkContext => ({
  id: row.id, userId: row.user_id as UserId, scopeId: row.scope_id, title: row.title, description: row.description,
  status: row.status, startDate: row.start_date, endDate: row.end_date
});

const mapTask = (row: TaskRow): Task => ({
  id: row.id as Task["id"], userId: row.user_id as UserId, workContextId: row.work_context_id,
  objectiveId: row.objective_id, title: row.title, description: row.description,
  executionMode: row.execution_mode as TaskExecutionMode, officialDeadline: row.official_deadline,
  internalDeadline: row.internal_deadline, estimatedMinutes: row.estimated_minutes,
  estimatedUserMinutes: row.estimated_user_minutes, actualMinutes: row.actual_minutes, importance: row.importance,
  status: row.status as TaskStatus, nextAction: row.next_action, completionCriteria: row.completion_criteria,
  completionSource: row.completion_source, createdAt: row.created_at, completedAt: row.completed_at, updatedAt: row.updated_at
});

export class SupabaseProjectPmRepository implements ProjectPmRepository {
  constructor(private readonly sql: Sql) {}

  async listProjects(userId: UserId): Promise<readonly ProjectWorkContext[]> {
    const rows = await this.sql<WorkContextRow[]>`
      select id,user_id,scope_id,title,description,status,start_date::text,end_date::text from public.work_contexts
      where user_id=${userId} and kind='project' and archived_at is null order by title
    `;
    return rows.map(mapProject);
  }

  async loadProjectContext(
    userId: UserId,
    project: ProjectWorkContext,
    planDate: string,
    timeZone: string,
    now: Date
  ): Promise<ProjectPmContext> {
    const projects = await this.sql<WorkContextRow[]>`
      select id,user_id,scope_id,title,description,status,start_date::text,end_date::text from public.work_contexts
      where id=${project.id} and user_id=${userId} and kind='project' and archived_at is null
    `;
    if (!projects[0]) throw new Error("Project WorkContext disappeared");
    const [objectives, goals, tasks, focus, planTasks, events] = await Promise.all([
      this.sql<{ id: string; title: string; goal_id: string | null; target_date: string | null; importance: number; status: string }[]>`
        select id,title,goal_id,target_date::text,importance,status from public.objectives
        where user_id=${userId} and work_context_id=${project.id} and status='active' order by importance desc,created_at
      `,
      this.sql<{ id: string; title: string; status: string }[]>`
        select distinct g.id,g.title,g.status from public.goals g join public.objectives o on o.goal_id=g.id and o.user_id=g.user_id
        where g.user_id=${userId} and o.work_context_id=${project.id} order by g.title
      `,
      this.sql<TaskRow[]>`
        select t.* from public.tasks t left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
        where t.user_id=${userId} and coalesce(t.work_context_id,o.work_context_id)=${project.id} order by t.created_at
      `,
      this.sql<{ session_id: string; task_id: string; title: string; started_at: Date }[]>`
        select f.id session_id,f.task_id,t.title,f.started_at from public.focus_sessions f
        join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
        left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
        where f.user_id=${userId} and f.status='active' and coalesce(t.work_context_id,o.work_context_id)=${project.id}
        order by f.started_at desc limit 1
      `,
      this.sql<{ task_id: string; position: number }[]>`
        select i.task_id,i.position from public.daily_plans p join public.plan_items i on i.daily_plan_id=p.id and i.user_id=p.user_id
        join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
        left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
        where p.user_id=${userId} and p.plan_date=${planDate} and p.status='approved'
          and i.item_type='task' and coalesce(t.work_context_id,o.work_context_id)=${project.id} and i.status not in ('completed','cancelled','skipped')
        order by p.revision_no desc,i.position
      `,
      this.sql<{ id: string; event_type: string; aggregate_type: string; aggregate_id: string; occurred_at: Date }[]>`
        select id,event_type,aggregate_type,aggregate_id,occurred_at from public.domain_events e
        where e.user_id=${userId} and (
          e.aggregate_id=${project.id}
          or e.aggregate_id in (select t.id from public.tasks t left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id where t.user_id=${userId} and coalesce(t.work_context_id,o.work_context_id)=${project.id})
          or e.aggregate_id in (select id from public.objectives where user_id=${userId} and work_context_id=${project.id})
        ) order by occurred_at desc,recorded_at desc limit 20
      `
    ]);
    return {
      userId, project: mapProject(projects[0]), observedAt: now, planDate, timeZone,
      objectives: objectives.map((item): ProjectObjective => ({
        id: item.id, title: item.title, goalId: item.goal_id, targetDate: item.target_date,
        importance: item.importance, status: item.status
      })),
      goals: goals.map((item): ProjectGoal => ({ id: item.id, title: item.title, status: item.status })),
      tasks: tasks.map(mapTask),
      activeFocus: focus[0] ? {
        sessionId: focus[0].session_id, taskId: focus[0].task_id, title: focus[0].title, startedAt: focus[0].started_at
      } : null,
      approvedPlanTasks: planTasks.map((item) => ({ taskId: item.task_id, position: item.position })),
      recentEvents: events.map((item): ProjectDomainEvent => ({
        id: item.id, eventType: item.event_type, aggregateType: item.aggregate_type,
        aggregateId: item.aggregate_id, occurredAt: item.occurred_at
      }))
    };
  }
}

export class SupabaseProjectPmRunRecorder implements ProjectPmRunRecorder {
  private readonly recorder: SupabaseAgentRunRecorder;

  constructor(sql: Sql) {
    this.recorder = new SupabaseAgentRunRecorder(sql);
  }

  findCompleted(userId: UserId, triggerId: string): Promise<string | null> {
    return this.recorder.findCompleted(userId, "project_pm", "project_pm_response", triggerId);
  }

  async recordCompleted(input: Parameters<ProjectPmRunRecorder["recordCompleted"]>[0]): Promise<void> {
    if (!input.context.project.scopeId) return;
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
      workstyleProfileRevisions: input.workstyle?.profileRevisions ?? [],
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      requiredScopeId: input.context.project.scopeId
    });
  }
}
