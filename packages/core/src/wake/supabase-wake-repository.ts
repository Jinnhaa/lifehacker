import { zonedDateTimeToUtc, type UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import type {
  WakeCheckpoint,
  WakeDeliveryClaim,
  WakeRepository,
  WakeSource,
  WakeTargetContext,
  WakeWorkflowRun
} from "./wake.js";

interface WorkflowRow {
  id: string;
  user_id: string;
  status: string;
  current_step: string;
  checkpoint_state: unknown;
  checkpoint_version: number;
  correlation_id: string;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

const mapWorkflow = (row: WorkflowRow): WakeWorkflowRun => {
  const checkpoint = asRecord(row.checkpoint_state);
  return {
    id: row.id,
    userId: row.user_id as UserId,
    status: row.status as WakeWorkflowRun["status"],
    currentStep: row.current_step as WakeWorkflowRun["currentStep"],
    checkpoint: {
      targetDate: String(checkpoint.targetDate ?? ""),
      timeZone: String(checkpoint.timeZone ?? ""),
      ...(typeof checkpoint.wakeAt === "string" ? { wakeAt: checkpoint.wakeAt } : {}),
      ...(checkpoint.source === "user" || checkpoint.source === "preference" || checkpoint.source === "personal_constraint" || checkpoint.source === "snooze"
        ? { source: checkpoint.source } : {}),
      ...(typeof checkpoint.firstConstraintTitle === "string" ? { firstConstraintTitle: checkpoint.firstConstraintTitle } : {}),
      ...(typeof checkpoint.firstConstraintAt === "string" ? { firstConstraintAt: checkpoint.firstConstraintAt } : {}),
      ...(typeof checkpoint.lastMessageId === "string" ? { lastMessageId: checkpoint.lastMessageId } : {}),
      ...(typeof checkpoint.acknowledgedAt === "string" ? { acknowledgedAt: checkpoint.acknowledgedAt } : {})
    },
    checkpointVersion: row.checkpoint_version,
    correlationId: row.correlation_id
  };
};

const normalizedTime = (value: unknown): string | null => {
  const candidate = typeof value === "string"
    ? value
    : (() => {
        const record = asRecord(value);
        return typeof record.time === "string" ? record.time
          : typeof record.wakeTime === "string" ? record.wakeTime
          : typeof record.defaultWakeTime === "string" ? record.defaultWakeTime
          : null;
      })();
  if (!candidate) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(candidate);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
};

const checkpointJson = (value: WakeCheckpoint): JSONValue => value as unknown as JSONValue;

export class SupabaseWakeRepository implements WakeRepository {
  constructor(private readonly sql: Sql) {}

  async findWorkflow(userId: UserId, targetDate: string): Promise<WakeWorkflowRun | null> {
    const rows = await this.sql<WorkflowRow[]>`
      select * from public.workflow_runs
      where user_id=${userId} and workflow_type='wake' and idempotency_key=${`wake:${targetDate}`}
    `;
    return rows[0] ? mapWorkflow(rows[0]) : null;
  }

  async getOrCreateAwaitingWorkflow(
    userId: UserId,
    targetDate: string,
    timeZone: string,
    context: WakeTargetContext,
    now: Date
  ): Promise<WakeWorkflowRun> {
    const checkpoint: WakeCheckpoint = {
      targetDate,
      timeZone,
      ...(context.firstConstraint?.title ? { firstConstraintTitle: context.firstConstraint.title } : {}),
      ...(context.firstConstraint ? { firstConstraintAt: context.firstConstraint.start.toISOString() } : {})
    };
    const rows = await this.sql<WorkflowRow[]>`
      insert into public.workflow_runs(
        user_id,workflow_type,status,current_step,checkpoint_state,checkpoint_version,idempotency_key,correlation_id,started_at
      ) values(
        ${userId},'wake','waiting_for_user','awaiting_time',${this.sql.json(checkpointJson(checkpoint))},0,
        ${`wake:${targetDate}`},gen_random_uuid(),${now}
      ) on conflict(user_id,idempotency_key) do update set updated_at=public.workflow_runs.updated_at returning *
    `;
    return mapWorkflow(rows[0]!);
  }

  async loadTargetContext(userId: UserId, targetDate: string, timeZone: string): Promise<WakeTargetContext> {
    const nextDate = new Date(`${targetDate}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const dayEnd = nextDate.toISOString().slice(0, 10);
    const dayStartAt = zonedDateTimeToUtc(`${targetDate}T00:00:00`, timeZone);
    const dayEndAt = zonedDateTimeToUtc(`${dayEnd}T00:00:00`, timeZone);
    const [settings, preferences, personalConstraints, fixedConstraints] = await Promise.all([
      this.sql<{ wake_policy: unknown }[]>`select wake_policy from public.user_settings where user_id=${userId}`,
      this.sql<{ value: unknown }[]>`
        select value from public.preferences where user_id=${userId}
          and preference_key in ('wake_time','wakeTime','preferred_wake_time','default_wake_time')
          and confirmation_status in ('confirmed','approved','active')
          and valid_from<${dayEndAt} and (valid_until is null or valid_until>=${dayStartAt})
        order by created_at desc limit 1
      `,
      this.sql<{ value: unknown; valid_until: Date | null }[]>`
        select value,valid_until from public.constraints where user_id=${userId} and constraint_type='personal_time'
          and valid_from<${dayEndAt} and (valid_until is null or valid_until>${dayStartAt})
        order by created_at desc
      `,
      this.sql<{ title: string | null; valid_from: Date }[]>`
        select nullif(c.value->>'title','') title,c.valid_from from public.constraints c
        where c.user_id=${userId} and c.valid_from<${dayEndAt}
          and coalesce(c.valid_until,c.valid_from)>${dayStartAt}
          and coalesce(c.value->>'blocksCapacity','false')='true'
          and coalesce(c.value->>'syncStatus','active')<>'deleted'
          and exists(
            select 1 from public.external_references r where r.user_id=c.user_id and r.internal_entity_id=c.id
              and r.internal_entity_type='constraint' and r.ownership='external' and r.sync_status='active'
          )
        order by c.valid_from limit 1
      `
    ]);
    const wakePolicy = asRecord(settings[0]?.wake_policy);
    const policyTime = normalizedTime(wakePolicy.defaultWakeTime ?? wakePolicy.wakeTime ?? wakePolicy.time);
    const preferenceTime = normalizedTime(preferences[0]?.value);
    let personalTime: string | null = null;
    for (const row of personalConstraints) {
      const value = asRecord(row.value);
      personalTime = normalizedTime(value.wakeAt ?? value.wakeTime);
      if (!personalTime && (value.kind === "sleep" || value.title === "수면") && row.valid_until) {
        personalTime = new Intl.DateTimeFormat("en-GB", {
          timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        }).format(row.valid_until);
      }
      if (personalTime) break;
    }
    const first = fixedConstraints[0];
    return {
      preferredWakeTime: policyTime ?? preferenceTime ?? personalTime,
      preferenceSource: policyTime || preferenceTime ? "preference" : personalTime ? "personal_constraint" : null,
      firstConstraint: first ? { title: first.title, start: first.valid_from } : null
    };
  }

  async schedule(run: WakeWorkflowRun, wakeAt: Date, source: WakeSource, messageId: string, now: Date): Promise<WakeWorkflowRun> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<WorkflowRow[]>`select * from public.workflow_runs where id=${run.id} and user_id=${run.userId} for update`;
      const current = mapWorkflow(rows[0]!);
      if (current.checkpoint.lastMessageId === messageId && current.currentStep === "scheduled") return current;
      await tx`
        update public.notifications set status='cancelled'
        where user_id=${run.userId} and workflow_run_id=${run.id} and status='scheduled'
      `;
      await tx`
        update public.scheduled_jobs set status='cancelled',updated_at=${now}
        where user_id=${run.userId} and workflow_run_id=${run.id} and job_type='wake_notification' and status in ('pending','running')
      `;
      const checkpoint: WakeCheckpoint = {
        ...current.checkpoint,
        wakeAt: wakeAt.toISOString(),
        source,
        lastMessageId: messageId
      };
      const updated = await tx<WorkflowRow[]>`
        update public.workflow_runs set status='running',current_step='scheduled',checkpoint_state=${tx.json(checkpointJson(checkpoint))},
          checkpoint_version=checkpoint_version+1,updated_at=${now},completed_at=null
        where id=${run.id} and user_id=${run.userId} returning *
      `;
      const notification = await tx<{ id: string }[]>`
        insert into public.notifications(
          user_id,workflow_run_id,channel,notification_type,priority,payload,scheduled_at,status,attempt_no,dedupe_key
        ) values(
          ${run.userId},${run.id},'discord','wake','high',${tx.json({
            targetDate: current.checkpoint.targetDate,
            timeZone: current.checkpoint.timeZone,
            firstConstraintTitle: current.checkpoint.firstConstraintTitle ?? null,
            firstConstraintAt: current.checkpoint.firstConstraintAt ?? null
          })},${wakeAt},'scheduled',1,${`wake:${current.checkpoint.targetDate}:${messageId}`}
        ) returning id
      `;
      await tx`
        insert into public.scheduled_jobs(user_id,workflow_run_id,job_key,job_type,run_at,payload,status,max_attempts)
        values(${run.userId},${run.id},${`wake:${notification[0]!.id}`},'wake_notification',${wakeAt},
          ${tx.json({ notificationId: notification[0]!.id })},'pending',1000)
      `;
      await tx`
        insert into public.domain_events(
          user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload
        ) values(${run.userId},'wake_scheduled','notification',${notification[0]!.id},${source === "user" ? "user" : "system"},
          ${now},${run.correlationId},${run.id},${`wake-scheduled:${messageId}`},1,
          ${tx.json({ targetDate: current.checkpoint.targetDate, wakeAt: wakeAt.toISOString(), source })})
        on conflict(user_id,idempotency_key) do nothing
      `;
      return mapWorkflow(updated[0]!);
    });
  }

  async acknowledgeForDate(userId: UserId, targetDate: string, messageId: string, now: Date): Promise<void> {
    await this.sql.begin(async (tx) => {
      const rows = await tx<WorkflowRow[]>`
        select * from public.workflow_runs where user_id=${userId} and workflow_type='wake'
          and idempotency_key=${`wake:${targetDate}`} for update
      `;
      if (!rows[0]) return;
      const run = mapWorkflow(rows[0]);
      if (run.currentStep === "acknowledged") return;
      await tx`
        update public.notifications set
          status=case when status in ('sent','delivered') then 'acknowledged' else 'cancelled' end,
          acknowledged_at=case when status in ('sent','delivered') then ${now} else acknowledged_at end
        where user_id=${userId} and workflow_run_id=${run.id} and status in ('scheduled','sent','delivered')
      `;
      await tx`
        update public.scheduled_jobs set status='cancelled',updated_at=${now}
        where user_id=${userId} and workflow_run_id=${run.id} and job_type='wake_notification' and status in ('pending','running')
      `;
      const checkpoint: WakeCheckpoint = {
        ...run.checkpoint, lastMessageId: messageId, acknowledgedAt: now.toISOString()
      };
      await tx`
        update public.workflow_runs set status='completed',current_step='acknowledged',
          checkpoint_state=${tx.json(checkpointJson(checkpoint))},checkpoint_version=checkpoint_version+1,
          updated_at=${now},completed_at=${now} where id=${run.id} and user_id=${userId}
      `;
      await tx`
        insert into public.domain_events(
          user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload
        ) values(${userId},'wake_acknowledged','workflow_run',${run.id},'user',${now},${run.correlationId},${run.id},
          ${`wake-acknowledged:${targetDate}`},1,${tx.json({ targetDate, messageId })})
        on conflict(user_id,idempotency_key) do nothing
      `;
    });
  }

  async snooze(userId: UserId, targetDate: string, wakeAt: Date, messageId: string, now: Date): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<WorkflowRow[]>`
        select * from public.workflow_runs where user_id=${userId} and workflow_type='wake'
          and idempotency_key=${`wake:${targetDate}`} for update
      `;
      if (!rows[0]) return false;
      const run = mapWorkflow(rows[0]);
      if (run.checkpoint.lastMessageId === messageId) return true;
      const sent = await tx<{ present: boolean }[]>`
        select exists(select 1 from public.notifications where user_id=${userId} and workflow_run_id=${run.id}
          and status in ('sent','delivered')) present
      `;
      if (!sent[0]?.present) return false;
      const notification = await tx<{ id: string }[]>`
        insert into public.notifications(
          user_id,workflow_run_id,channel,notification_type,priority,payload,scheduled_at,status,attempt_no,dedupe_key
        ) values(${userId},${run.id},'discord','wake','high',${tx.json({
          targetDate, timeZone: run.checkpoint.timeZone,
          firstConstraintTitle: run.checkpoint.firstConstraintTitle ?? null,
          firstConstraintAt: run.checkpoint.firstConstraintAt ?? null,
          snooze: true
        })},${wakeAt},'scheduled',1,${`wake-snooze:${messageId}`}) returning id
      `;
      await tx`
        insert into public.scheduled_jobs(user_id,workflow_run_id,job_key,job_type,run_at,payload,status,max_attempts)
        values(${userId},${run.id},${`wake:${notification[0]!.id}`},'wake_notification',${wakeAt},
          ${tx.json({ notificationId: notification[0]!.id })},'pending',1000)
      `;
      await tx`
        insert into public.domain_events(
          user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload
        ) values(${userId},'wake_snoozed','notification',${notification[0]!.id},'user',${now},${run.correlationId},${run.id},
          ${`wake-snoozed:${messageId}`},1,${tx.json({ targetDate, wakeAt: wakeAt.toISOString() })})
        on conflict(user_id,idempotency_key) do nothing
      `;
      await tx`
        update public.workflow_runs set status='running',current_step='scheduled',
          checkpoint_state=${tx.json(checkpointJson({ ...run.checkpoint, wakeAt: wakeAt.toISOString(), source: "snooze", lastMessageId: messageId }))},
          checkpoint_version=checkpoint_version+1,updated_at=${now},completed_at=null
        where id=${run.id} and user_id=${userId}
      `;
      return true;
    });
  }

  async claimDue(now: Date): Promise<WakeDeliveryClaim | null> {
    return this.sql.begin(async (tx) => {
      const jobs = await tx<{ id: string; user_id: string; notification_id: string }[]>`
        select j.id,j.user_id,n.id notification_id from public.scheduled_jobs j
        join public.notifications n on n.user_id=j.user_id and n.workflow_run_id=j.workflow_run_id
          and n.id=(j.payload->>'notificationId')::uuid
        where j.job_type='wake_notification' and j.status='pending' and j.run_at<=${now}
          and j.attempt_count<j.max_attempts and n.status='scheduled'
        order by j.run_at,j.created_at for update of j skip locked limit 1
      `;
      const job = jobs[0];
      if (!job) return null;
      await tx`
        update public.scheduled_jobs set status='running',attempt_count=attempt_count+1,updated_at=${now},last_error=null
        where id=${job.id} and user_id=${job.user_id} and status='pending'
      `;
      const rows = await tx<{
        job_id: string; notification_id: string; user_id: string; external_account_id: string;
        scheduled_at: Date; payload: unknown;
      }[]>`
        select j.id job_id,n.id notification_id,n.user_id,a.external_account_id,n.scheduled_at,n.payload
        from public.scheduled_jobs j join public.notifications n on n.id=${job.notification_id} and n.user_id=j.user_id
        join public.integration_accounts a on a.user_id=n.user_id and a.provider='discord' and a.status='active'
        where j.id=${job.id} and j.user_id=${job.user_id} and a.external_account_id is not null
        order by a.created_at limit 1
      `;
      const row = rows[0];
      if (!row) {
        await tx`update public.scheduled_jobs set status='pending',last_error='Discord account unavailable',updated_at=${now} where id=${job.id}`;
        return null;
      }
      const payload = asRecord(row.payload);
      const firstAt = typeof payload.firstConstraintAt === "string" ? new Date(payload.firstConstraintAt) : null;
      return {
        jobId: row.job_id,
        notificationId: row.notification_id,
        userId: row.user_id as UserId,
        discordUserId: row.external_account_id,
        wakeAt: row.scheduled_at,
        timeZone: String(payload.timeZone ?? "Asia/Seoul"),
        firstConstraintTitle: typeof payload.firstConstraintTitle === "string" ? payload.firstConstraintTitle : null,
        firstConstraintAt: firstAt && !Number.isNaN(firstAt.getTime()) ? firstAt : null
      };
    });
  }

  async completeDelivery(claim: WakeDeliveryClaim, now: Date): Promise<void> {
    await this.sql.begin(async (tx) => {
      const jobs = await tx<{ status: string }[]>`
        select status from public.scheduled_jobs where id=${claim.jobId} and user_id=${claim.userId} for update
      `;
      if (jobs[0]?.status !== "running") return;
      await tx`
        update public.notifications set status='sent',sent_at=${now}
        where id=${claim.notificationId} and user_id=${claim.userId} and status='scheduled'
      `;
      await tx`
        update public.scheduled_jobs set status='completed',updated_at=${now}
        where id=${claim.jobId} and user_id=${claim.userId} and status='running'
      `;
    });
  }

  async failDelivery(claim: WakeDeliveryClaim, error: string, now: Date): Promise<void> {
    await this.sql`
      update public.scheduled_jobs set status='pending',last_error=${error.slice(0, 500)},updated_at=${now}
      where id=${claim.jobId} and user_id=${claim.userId} and status='running'
        and exists(select 1 from public.notifications n where n.id=${claim.notificationId}
          and n.user_id=${claim.userId} and n.status='scheduled')
    `;
  }
}
