import { zonedDateTimeToUtc } from "@amber/shared";
const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value)
    ? value : {};
const stringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const mapRecurring = (value) => Array.isArray(value) ? value.flatMap((entry) => {
    const item = asRecord(entry);
    return typeof item.recurringActivityId === "string" && typeof item.title === "string" && typeof item.status === "string"
        ? [{ recurringActivityId: item.recurringActivityId, title: item.title, status: item.status, completed: item.completed === true }]
        : [];
}) : [];
const mapTaskOutcomes = (value) => Array.isArray(value) ? value.flatMap((entry) => {
    const item = asRecord(entry);
    return typeof item.taskId === "string" && typeof item.title === "string" && typeof item.status === "string" && typeof item.actualMinutes === "number"
        ? [{
                taskId: item.taskId,
                title: item.title,
                status: item.status,
                estimatedMinutes: typeof item.estimatedMinutes === "number" ? item.estimatedMinutes : null,
                actualMinutes: item.actualMinutes,
                deltaMinutes: typeof item.deltaMinutes === "number" ? item.deltaMinutes : null
            }]
        : [];
}) : [];
const mapResult = (value) => {
    const item = asRecord(value);
    if (typeof item.date !== "string" || typeof item.closedAt !== "string")
        return undefined;
    return {
        date: item.date,
        completedTaskIds: stringArray(item.completedTaskIds),
        incompleteTaskIds: stringArray(item.incompleteTaskIds),
        blockedTaskIds: stringArray(item.blockedTaskIds),
        plannedItemCount: Number(item.plannedItemCount ?? 0),
        completedItemCount: Number(item.completedItemCount ?? 0),
        incompleteItemCount: Number(item.incompleteItemCount ?? 0),
        plannedMinutes: Number(item.plannedMinutes ?? 0),
        actualMinutes: Number(item.actualMinutes ?? 0),
        varianceMinutes: Number(item.varianceMinutes ?? 0),
        replanCount: Number(item.replanCount ?? 0),
        recurringActivityStatus: mapRecurring(item.recurringActivityStatus),
        carryoverTaskIds: stringArray(item.carryoverTaskIds),
        taskOutcomes: mapTaskOutcomes(item.taskOutcomes),
        closedAt: item.closedAt
    };
};
const mapWorkflow = (row) => {
    const checkpoint = asRecord(row.checkpoint_state);
    const result = mapResult(checkpoint.result);
    return {
        id: row.id,
        userId: row.user_id,
        status: row.status,
        currentStep: row.current_step,
        checkpoint: {
            date: String(checkpoint.date ?? ""),
            timeZone: String(checkpoint.timeZone ?? ""),
            ...(typeof checkpoint.lastMessageId === "string" ? { lastMessageId: checkpoint.lastMessageId } : {}),
            ...(result ? { result } : {})
        },
        checkpointVersion: row.checkpoint_version,
        correlationId: row.correlation_id
    };
};
const addDays = (date, count) => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + count);
    return value.toISOString().slice(0, 10);
};
const dayBounds = (date, timeZone) => ({
    start: zonedDateTimeToUtc(`${date}T00:00:00`, timeZone),
    end: zonedDateTimeToUtc(`${addDays(date, 1)}T00:00:00`, timeZone)
});
const elapsedMinutes = (startedAt, now) => Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));
export class SupabaseDayCloseRepository {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async getOrCreateWorkflow(userId, date, timeZone, now) {
        const rows = await this.sql `
      insert into public.workflow_runs(user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at)
      values(${userId},'day_close','running','observe',${this.sql.json({ date, timeZone })},0,${`day-close:${date}`},gen_random_uuid(),${now})
      on conflict(user_id,idempotency_key) do update set updated_at=public.workflow_runs.updated_at returning *
    `;
        return mapWorkflow(rows[0]);
    }
    async findWorkflow(userId, date) {
        const rows = await this.sql `
      select * from public.workflow_runs where user_id=${userId} and workflow_type='day_close' and idempotency_key=${`day-close:${date}`}
    `;
        return rows[0] ? mapWorkflow(rows[0]) : null;
    }
    async hasActiveFocus(userId) {
        const rows = await this.sql `
      select exists(select 1 from public.focus_sessions where user_id=${userId} and status='active') present
    `;
        return rows[0]?.present ?? false;
    }
    async awaitFocusConfirmation(run, messageId, now) {
        const checkpoint = { ...run.checkpoint, lastMessageId: messageId };
        const rows = await this.sql `
      update public.workflow_runs set status='waiting_for_user',current_step='awaiting_focus_confirmation',
        checkpoint_state=${this.sql.json(checkpoint)},checkpoint_version=checkpoint_version+1,updated_at=${now}
      where id=${run.id} and user_id=${run.userId} and checkpoint_version=${run.checkpointVersion} returning *
    `;
        if (rows[0])
            return mapWorkflow(rows[0]);
        const current = await this.findWorkflow(run.userId, run.checkpoint.date);
        if (!current)
            throw new Error("Day Close workflow disappeared");
        return current;
    }
    async closeActiveFocus(run, messageId, now) {
        await this.sql.begin(async (tx) => {
            const sessions = await tx `
        select id,task_id,plan_item_id,started_at from public.focus_sessions
        where user_id=${run.userId} and status='active' order by started_at desc limit 1 for update
      `;
            const session = sessions[0];
            if (!session)
                return;
            const minutes = elapsedMinutes(session.started_at, now);
            await tx `
        update public.focus_sessions set status='cancelled',ended_at=${now},end_reason='day_close',actual_minutes=actual_minutes+${minutes}
        where id=${session.id} and user_id=${run.userId} and status='active'
      `;
            await tx `update public.tasks set actual_minutes=actual_minutes+${minutes},updated_at=${now} where id=${session.task_id} and user_id=${run.userId}`;
            if (session.plan_item_id) {
                await tx `update public.plan_items set status='paused',updated_at=${now} where id=${session.plan_item_id} and user_id=${run.userId}`;
            }
            await tx `
        update public.workflow_runs set status='completed',current_step='completed',checkpoint_version=checkpoint_version+1,
          checkpoint_state=checkpoint_state || ${tx.json({ lastMessageId: messageId })},updated_at=${now},completed_at=${now}
        where user_id=${run.userId} and workflow_type='focus' and checkpoint_state->>'sessionId'=${session.id} and status in ('running','waiting_for_user')
      `;
            await tx `
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
        values(${run.userId},'focus_cancelled','focus_session',${session.id},'user',${now},${run.correlationId},${run.id},
          ${`day-close-focus:${run.id}`},1,${tx.json({ reason: "day_close", task_id: session.task_id, actual_minutes: minutes })})
        on conflict(user_id,idempotency_key) do nothing
      `;
        });
    }
    async loadObservation(userId, date, timeZone) {
        const bounds = dayBounds(date, timeZone);
        const plans = await this.sql `
      select id from public.daily_plans where user_id=${userId} and plan_date=${date} and status='approved' order by revision_no desc limit 1
    `;
        const planId = plans[0]?.id ?? null;
        const planItems = planId ? await this.sql `
      select i.item_type,i.status,i.planned_minutes,i.task_id,t.status task_status,o.recurring_activity_id,
        a.title recurring_title,o.status occurrence_status
      from public.plan_items i left join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
      left join public.activity_occurrences o on o.id=i.activity_occurrence_id and o.user_id=i.user_id
      left join public.recurring_activities a on a.id=o.recurring_activity_id and a.user_id=o.user_id
      where i.user_id=${userId} and i.daily_plan_id=${planId} and i.item_type in ('task','routine') order by i.position
    ` : [];
        const [focus, completed, blocked, replan, recurring, outcomes] = await Promise.all([
            this.sql `
        select coalesce(sum(actual_minutes),0)::int actual_minutes from public.focus_sessions
        where user_id=${userId} and started_at>=${bounds.start} and started_at<${bounds.end}
      `,
            this.sql `
        select distinct t.id from public.tasks t where t.user_id=${userId} and t.status='DONE'
          and ((t.completed_at>=${bounds.start} and t.completed_at<${bounds.end})
            or exists(select 1 from public.plan_items i where i.user_id=t.user_id and i.task_id=t.id and i.daily_plan_id=${planId}))
      `,
            this.sql `
        select distinct t.id from public.tasks t where t.user_id=${userId} and t.status='BLOCKED'
          and (exists(select 1 from public.plan_items i where i.user_id=t.user_id and i.task_id=t.id and i.daily_plan_id=${planId})
            or exists(select 1 from public.domain_events e where e.user_id=t.user_id and e.aggregate_id=t.id and e.event_type='task_blocked'
              and e.occurred_at>=${bounds.start} and e.occurred_at<${bounds.end}))
      `,
            this.sql `
        select count(*)::int count from public.domain_events where user_id=${userId} and event_type='plan_replanned'
          and occurred_at>=${bounds.start} and occurred_at<${bounds.end}
      `,
            this.sql `
        select o.recurring_activity_id,a.title,o.status,(o.status='completed' and o.counts_toward_target) completed
        from public.activity_occurrences o join public.recurring_activities a on a.id=o.recurring_activity_id and a.user_id=o.user_id
        where o.user_id=${userId} and o.planned_date=${date} and o.status not in ('cancelled','skipped') order by a.title,o.sequence_no
      `,
            this.sql `
        with relevant_tasks as (
          select i.task_id id from public.plan_items i where i.user_id=${userId} and i.daily_plan_id=${planId} and i.task_id is not null
          union select f.task_id from public.focus_sessions f where f.user_id=${userId} and f.started_at>=${bounds.start} and f.started_at<${bounds.end}
          union select e.aggregate_id from public.domain_events e where e.user_id=${userId} and e.aggregate_type='task'
            and e.event_type in ('task_completed','task_blocked') and e.occurred_at>=${bounds.start} and e.occurred_at<${bounds.end}
        )
        select t.id task_id,t.title,t.status,coalesce(t.estimated_user_minutes,t.estimated_minutes) estimated_minutes,
          coalesce(sum(f.actual_minutes),0)::int actual_minutes
        from relevant_tasks r join public.tasks t on t.id=r.id and t.user_id=${userId}
        left join public.focus_sessions f on f.task_id=t.id and f.user_id=t.user_id and f.started_at>=${bounds.start} and f.started_at<${bounds.end}
        group by t.id order by t.title
      `
        ]);
        const recurringStatus = recurring.map((item) => ({
            recurringActivityId: item.recurring_activity_id, title: item.title, status: item.status, completed: item.completed
        }));
        const taskOutcomes = outcomes.map((item) => ({
            taskId: item.task_id, title: item.title, status: item.status, estimatedMinutes: item.estimated_minutes, actualMinutes: item.actual_minutes,
            deltaMinutes: item.estimated_minutes === null ? null : item.actual_minutes - item.estimated_minutes
        }));
        return {
            planId,
            planItems: planItems.map((item) => ({
                itemType: item.item_type, status: item.status, plannedMinutes: item.planned_minutes, taskId: item.task_id,
                taskStatus: item.task_status, recurringActivityId: item.recurring_activity_id, recurringTitle: item.recurring_title,
                occurrenceStatus: item.occurrence_status
            })),
            completedTaskIds: completed.map((item) => item.id),
            blockedTaskIds: blocked.map((item) => item.id),
            actualFocusMinutes: focus[0]?.actual_minutes ?? 0,
            replanCount: replan[0]?.count ?? 0,
            recurringActivityStatus: recurringStatus,
            taskOutcomes
        };
    }
    async complete(run, result, messageId, now) {
        return this.sql.begin(async (tx) => {
            const rows = await tx `select * from public.workflow_runs where id=${run.id} and user_id=${run.userId} for update`;
            const current = mapWorkflow(rows[0]);
            if (current.status === "completed" && current.checkpoint.result)
                return { result: current.checkpoint.result, duplicate: true };
            const plan = await tx `
        select id from public.daily_plans where user_id=${run.userId} and plan_date=${run.checkpoint.date} and status='approved'
        order by revision_no desc limit 1 for update
      `;
            if (plan[0])
                await tx `update public.daily_plans set status='closed',closed_at=${now} where id=${plan[0].id} and user_id=${run.userId} and status='approved'`;
            const checkpoint = { ...current.checkpoint, result, lastMessageId: messageId };
            await tx `
        update public.workflow_runs set status='completed',current_step='completed',checkpoint_state=${tx.json(checkpoint)},
          checkpoint_version=checkpoint_version+1,updated_at=${now},completed_at=${now} where id=${run.id} and user_id=${run.userId}
      `;
            await tx `
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
        values(${run.userId},'day_closed',${plan[0] ? "daily_plan" : "workflow_run"},${plan[0]?.id ?? run.id},'user',${now},${run.correlationId},${run.id},
          ${`day-closed:${run.checkpoint.date}`},1,${tx.json(result)}) on conflict(user_id,idempotency_key) do nothing
      `;
            return { result, duplicate: false };
        });
    }
}
//# sourceMappingURL=supabase-day-close-repository.js.map