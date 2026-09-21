import type { UserId } from "@amber/shared";
import postgres, { type Sql } from "postgres";
import type { SnowboardAcademicSchedule } from "./contracts.js";

interface ReferenceRow {
  id: string;
  external_version: string | null;
  content_hash: string | null;
  internal_entity_type: string;
  internal_entity_id: string;
}

export interface AcademicScheduleSyncResult {
  readonly received: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
}

export class SupabaseAcademicScheduleRepository {
  constructor(private readonly sql: Sql) {}

  async applySchedules(userId: UserId, schedules: readonly SnowboardAcademicSchedule[]): Promise<AcademicScheduleSyncResult> {
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const schedule of schedules) {
      const result = await this.applySchedule(userId, schedule);
      if (result === "created") created += 1;
      else if (result === "updated") updated += 1;
      else unchanged += 1;
    }
    return { received: schedules.length, created, updated, unchanged };
  }

  private applySchedule(userId: UserId, schedule: SnowboardAcademicSchedule): Promise<"created" | "updated" | "unchanged"> {
    return this.sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext(${`${userId}:snowboard:academic_schedule:${schedule.externalId}`}))`;
      const courseReferences = await transaction<{ internal_entity_id: string }[]>`
        select internal_entity_id from public.external_references
        where user_id=${userId} and source='snowboard' and external_type='course' and external_id=${schedule.courseId}
          and internal_entity_type='work_context' and sync_status='active'
      `;
      const courseContextId = courseReferences[0]?.internal_entity_id;
      if (!courseContextId) throw new Error(`Snowboard course ${schedule.courseId} has no Course WorkContext mapping`);

      const references = await transaction<ReferenceRow[]>`
        select id,external_version,content_hash,internal_entity_type,internal_entity_id
        from public.external_references
        where user_id=${userId} and source='snowboard' and external_type='academic_schedule' and external_id=${schedule.externalId}
        for update
      `;
      const reference = references[0];
      const contentHash = schedule.externalVersion;
      const value = {
        title: schedule.title,
        externalId: schedule.externalId,
        courseId: schedule.courseId,
        courseTitle: schedule.courseTitle,
        courseContextId,
        sourceUrl: schedule.sourceUrl,
        allDay: false,
        timeZone: schedule.timeZone,
        blocksCapacity: true,
        syncStatus: "active"
      };
      if (reference) {
        if (reference.internal_entity_type !== "constraint") {
          throw new Error(`Snowboard academic schedule ${schedule.externalId} is not linked to a constraint`);
        }
        if (reference.external_version === schedule.externalVersion && reference.content_hash === contentHash) {
          await transaction`update public.external_references set last_seen_at=${schedule.observedAt} where id=${reference.id} and user_id=${userId}`;
          return "unchanged";
        }
        await transaction`
          update public.constraints set value=${transaction.json(value as postgres.JSONValue)},hardness='hard',
            valid_from=${schedule.start},valid_until=${schedule.end},reason='Snowboard official academic schedule',origin='snowboard'
          where id=${reference.internal_entity_id} and user_id=${userId}
        `;
        await transaction`
          update public.external_references set external_version=${schedule.externalVersion},content_hash=${contentHash},
            sync_status='active',last_seen_at=${schedule.observedAt},deleted_at=null
          where id=${reference.id} and user_id=${userId}
        `;
        await this.appendEvent(transaction, userId, reference.internal_entity_id, schedule);
        return "updated";
      }

      const constraints = await transaction<{ id: string }[]>`
        insert into public.constraints(user_id,constraint_type,value,hardness,valid_from,valid_until,reason,origin)
        values (${userId},'availability',${transaction.json(value as postgres.JSONValue)},'hard',${schedule.start},${schedule.end},'Snowboard official academic schedule','snowboard')
        returning id
      `;
      const constraintId = constraints[0]!.id;
      await transaction`
        insert into public.external_references(
          user_id,source,external_type,external_id,external_version,ownership,content_hash,
          internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at
        ) values (
          ${userId},'snowboard','academic_schedule',${schedule.externalId},${schedule.externalVersion},'external',${contentHash},
          'constraint',${constraintId},'active',${schedule.observedAt},${schedule.observedAt}
        )
      `;
      await this.appendEvent(transaction, userId, constraintId, schedule);
      return "created";
    });
  }

  private async appendEvent(transaction: Sql, userId: UserId, constraintId: string, schedule: SnowboardAcademicSchedule): Promise<void> {
    await transaction`
      insert into public.domain_events(
        user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload
      ) values (
        ${userId},'external_academic_schedule_reconciled','constraint',${constraintId},'snowboard',${schedule.observedAt},gen_random_uuid(),
        ${`snowboard:academic_schedule:${schedule.externalId}:${schedule.externalVersion}`},1,
        ${transaction.json({ source: "snowboard", externalType: "academic_schedule", externalId: schedule.externalId } as postgres.JSONValue)}
      ) on conflict(user_id,idempotency_key) do nothing
    `;
  }
}
