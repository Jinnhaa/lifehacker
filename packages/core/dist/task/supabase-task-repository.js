import postgres from "postgres";
const mapTask = (row) => ({
    id: row.id,
    userId: row.user_id,
    workContextId: row.work_context_id,
    objectiveId: row.objective_id,
    title: row.title,
    description: row.description,
    executionMode: row.execution_mode,
    officialDeadline: row.official_deadline,
    internalDeadline: row.internal_deadline,
    estimatedMinutes: row.estimated_minutes,
    estimatedUserMinutes: row.estimated_user_minutes,
    actualMinutes: row.actual_minutes,
    importance: row.importance,
    status: row.status,
    nextAction: row.next_action,
    completionCriteria: row.completion_criteria,
    completionSource: row.completion_source,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at
});
const appendEvent = async (sql, event) => {
    await sql `
    insert into public.domain_events (
      user_id, event_type, aggregate_type, aggregate_id, actor_type, occurred_at,
      correlation_id, idempotency_key, payload_version, payload
    ) values (
      ${event.userId}, ${event.eventType}, 'task', ${event.aggregateId}, ${event.actorType}, ${event.occurredAt},
      ${event.correlationId}, ${event.idempotencyKey ?? null}, 1, ${sql.json(event.payload)}
    )
  `;
};
export class SupabaseTaskRepository {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    static connect(connectionString) {
        return new SupabaseTaskRepository(postgres(connectionString, { max: 10 }));
    }
    async close() {
        await this.sql.end();
    }
    async getTaskById(userId, taskId) {
        const rows = await this.sql `select * from public.tasks where id=${taskId} and user_id=${userId}`;
        return rows[0] ? mapTask(rows[0]) : null;
    }
    async listActiveTasks(userId) {
        const rows = await this.sql `
      select * from public.tasks where user_id=${userId} and status<>'DONE' order by created_at
    `;
        return rows.map(mapTask);
    }
    async createTask(input, event) {
        return this.sql.begin(async (tx) => {
            const rows = await tx `
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
            const task = mapTask(rows[0]);
            await appendEvent(tx, { ...event, aggregateId: task.id });
            return task;
        });
    }
    async updateTask(userId, taskId, patch) {
        const current = await this.getTaskById(userId, taskId);
        if (!current)
            return null;
        const rows = await this.sql `
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
    async transitionTask(userId, taskId, expectedStatus, nextStatus, completedAt, event) {
        return this.sql.begin(async (tx) => {
            const rows = await tx `
        update public.tasks set
          status=${nextStatus}, completed_at=${completedAt}, updated_at=${event.occurredAt}
        where id=${taskId} and user_id=${userId} and status=${expectedStatus}
        returning *
      `;
            if (!rows[0]) {
                const current = await tx `
          select status from public.tasks where id=${taskId} and user_id=${userId}
        `;
                return current[0]
                    ? { kind: "stale", currentStatus: current[0].status }
                    : { kind: "not_found" };
            }
            await appendEvent(tx, { ...event, aggregateId: taskId });
            return { kind: "updated", task: mapTask(rows[0]) };
        });
    }
    async appendDomainEvent(event) {
        await appendEvent(this.sql, event);
    }
}
//# sourceMappingURL=supabase-task-repository.js.map