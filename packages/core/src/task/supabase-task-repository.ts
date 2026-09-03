import type { TaskId, UserId } from "@amber/shared";
import postgres, { type Sql } from "postgres";
import type { CreateTaskRecord, Task, TaskExecutionMode, TaskStatus, UpdateTaskRecord } from "./task.js";
import type { TaskDomainEventInput } from "./task-event.js";
import type { TaskRepository, TransitionTaskResult } from "./task-repository.js";

interface TaskRow {
  id: string;
  user_id: string;
  work_context_id: string | null;
  objective_id: string | null;
  title: string;
  description: string | null;
  execution_mode: string;
  official_deadline: Date | null;
  internal_deadline: Date | null;
  estimated_minutes: number | null;
  estimated_user_minutes: number | null;
  actual_minutes: number;
  importance: number;
  status: string;
  next_action: string | null;
  completion_criteria: string | null;
  completion_source: string | null;
  created_at: Date;
  completed_at: Date | null;
  updated_at: Date;
}

const mapTask = (row: TaskRow): Task => ({
  id: row.id as TaskId,
  userId: row.user_id as UserId,
  workContextId: row.work_context_id,
  objectiveId: row.objective_id,
  title: row.title,
  description: row.description,
  executionMode: row.execution_mode as TaskExecutionMode,
  officialDeadline: row.official_deadline,
  internalDeadline: row.internal_deadline,
  estimatedMinutes: row.estimated_minutes,
  estimatedUserMinutes: row.estimated_user_minutes,
  actualMinutes: row.actual_minutes,
  importance: row.importance,
  status: row.status as TaskStatus,
  nextAction: row.next_action,
  completionCriteria: row.completion_criteria,
  completionSource: row.completion_source,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  updatedAt: row.updated_at
});

const appendEvent = async (sql: Sql, event: TaskDomainEventInput & { readonly aggregateId: TaskId }): Promise<void> => {
  await sql`
    insert into public.domain_events (
      user_id, event_type, aggregate_type, aggregate_id, actor_type, occurred_at,
      correlation_id, idempotency_key, payload_version, payload
    ) values (
      ${event.userId}, ${event.eventType}, 'task', ${event.aggregateId}, ${event.actorType}, ${event.occurredAt},
      ${event.correlationId}, ${event.idempotencyKey ?? null}, 1, ${sql.json(event.payload as unknown as postgres.JSONValue)}
    )
  `;
};

export class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly sql: Sql) {}

  static connect(connectionString: string): SupabaseTaskRepository {
    return new SupabaseTaskRepository(postgres(connectionString, { max: 10 }));
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  async getTaskById(userId: UserId, taskId: TaskId): Promise<Task | null> {
    const rows = await this.sql<TaskRow[]>`select * from public.tasks where id=${taskId} and user_id=${userId}`;
    return rows[0] ? mapTask(rows[0]) : null;
  }

  async listActiveTasks(userId: UserId): Promise<readonly Task[]> {
    const rows = await this.sql<TaskRow[]>`
      select * from public.tasks where user_id=${userId} and status<>'DONE' order by created_at
    `;
    return rows.map(mapTask);
  }

  async createTask(input: CreateTaskRecord, event: Omit<TaskDomainEventInput, "aggregateId">): Promise<Task> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<TaskRow[]>`
        insert into public.tasks (
          user_id, work_context_id, objective_id, title, description, execution_mode,
          official_deadline, internal_deadline, estimated_minutes, estimated_user_minutes,
          importance, status, next_action, completion_criteria
        ) values (
          ${input.userId}, ${input.workContextId ?? null}, ${input.objectiveId ?? null}, ${input.title},
          ${input.description ?? null}, ${input.executionMode}, ${input.officialDeadline ?? null},
          ${input.internalDeadline ?? null}, ${input.estimatedMinutes ?? null}, ${input.estimatedUserMinutes ?? null},
          ${input.importance}, 'INBOX', ${input.nextAction ?? null}, ${input.completionCriteria ?? null}
        ) returning *
      `;
      const task = mapTask(rows[0]!);
      await appendEvent(tx, { ...event, aggregateId: task.id });
      return task;
    });
  }

  async updateTask(userId: UserId, taskId: TaskId, patch: UpdateTaskRecord): Promise<Task | null> {
    const current = await this.getTaskById(userId, taskId);
    if (!current) return null;
    const rows = await this.sql<TaskRow[]>`
      update public.tasks set
        title=${patch.title ?? current.title},
        description=${patch.description === undefined ? current.description : patch.description},
        official_deadline=${patch.officialDeadline === undefined ? current.officialDeadline : patch.officialDeadline},
        internal_deadline=${patch.internalDeadline === undefined ? current.internalDeadline : patch.internalDeadline},
        estimated_minutes=${patch.estimatedMinutes === undefined ? current.estimatedMinutes : patch.estimatedMinutes},
        estimated_user_minutes=${patch.estimatedUserMinutes === undefined ? current.estimatedUserMinutes : patch.estimatedUserMinutes},
        importance=${patch.importance ?? current.importance},
        next_action=${patch.nextAction === undefined ? current.nextAction : patch.nextAction},
        completion_criteria=${patch.completionCriteria === undefined ? current.completionCriteria : patch.completionCriteria},
        updated_at=now()
      where id=${taskId} and user_id=${userId}
      returning *
    `;
    return rows[0] ? mapTask(rows[0]) : null;
  }

  async transitionTask(
    userId: UserId,
    taskId: TaskId,
    expectedStatus: TaskStatus,
    nextStatus: TaskStatus,
    completedAt: Date | null,
    event: TaskDomainEventInput
  ): Promise<TransitionTaskResult> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<TaskRow[]>`
        update public.tasks set
          status=${nextStatus}, completed_at=${completedAt}, updated_at=${event.occurredAt}
        where id=${taskId} and user_id=${userId} and status=${expectedStatus}
        returning *
      `;
      if (!rows[0]) {
        const current = await tx<{ status: string }[]>`
          select status from public.tasks where id=${taskId} and user_id=${userId}
        `;
        return current[0]
          ? { kind: "stale" as const, currentStatus: current[0].status as TaskStatus }
          : { kind: "not_found" as const };
      }
      await appendEvent(tx, { ...event, aggregateId: taskId });
      return { kind: "updated" as const, task: mapTask(rows[0]) };
    });
  }

  async appendDomainEvent(event: TaskDomainEventInput & { readonly aggregateId: TaskId }): Promise<void> {
    await appendEvent(this.sql, event);
  }
}
