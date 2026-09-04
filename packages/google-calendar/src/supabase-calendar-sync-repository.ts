import type postgres from "postgres";
import type { Sql } from "postgres";
import type {
  ApplyCalendarSyncInput,
  ApplyCalendarSyncResult,
  CalendarSyncRepository,
  FixedTimeConstraint
} from "./calendar-sync-repository.js";
import { GOOGLE_CALENDAR_SOURCE, type CalendarIntegrationAccount, type NormalizedCalendarEvent } from "./contracts.js";

interface AccountRow { id: string; user_id: string; secret_ref: string | null; metadata: Record<string, unknown> }
interface ReferenceRow { id: string; internal_entity_id: string; ownership: "external" | "amber_managed" }

export class SupabaseCalendarSyncRepository implements CalendarSyncRepository {
  constructor(private readonly sql: Sql) {}

  async getActiveAccount(userId: string): Promise<CalendarIntegrationAccount | null> {
    const rows = await this.sql<AccountRow[]>`
      select id,user_id,secret_ref,metadata from public.integration_accounts
      where user_id=${userId} and provider=${GOOGLE_CALENDAR_SOURCE} and status='active'
      order by created_at limit 2
    `;
    if (rows.length !== 1 || !rows[0]!.secret_ref) return null;
    const metadata = rows[0]!.metadata;
    const calendar = metadata.calendar;
    const state = calendar && typeof calendar === "object" ? calendar as Record<string, unknown> : {};
    return {
      id: rows[0]!.id,
      userId: rows[0]!.user_id,
      secretRef: rows[0]!.secret_ref,
      calendarId: typeof state.calendarId === "string" ? state.calendarId : "primary",
      syncToken: typeof state.syncToken === "string" ? state.syncToken : null,
      metadata
    };
  }

  async applySync(input: ApplyCalendarSyncInput): Promise<ApplyCalendarSyncResult> {
    return this.sql.begin(async (tx) => {
      let active = 0;
      let deleted = 0;
      const seen = new Set<string>();
      for (const event of input.events) {
        const identity = externalIdentity(event);
        seen.add(identity);
        const changed = await this.reconcileEvent(tx, input, event, identity);
        if (changed === "active") active += 1;
        if (changed === "deleted") deleted += 1;
      }
      if (input.fullSync) {
        deleted += await this.tombstoneMissing(tx, input, seen);
      }
      const previousCalendar = input.account.metadata.calendar;
      const calendarMetadata = previousCalendar && typeof previousCalendar === "object"
        ? previousCalendar as Record<string, unknown> : {};
      const metadata = {
        ...input.account.metadata,
        calendar: {
          ...calendarMetadata,
          calendarId: input.account.calendarId,
          syncToken: input.nextSyncToken,
          windowStart: input.window.start.toISOString(),
          windowEnd: input.window.end.toISOString()
        }
      };
      await tx`
        update public.integration_accounts set metadata=${tx.json(metadata as postgres.JSONValue)},last_sync_at=${input.synchronizedAt}
        where id=${input.account.id} and user_id=${input.account.userId}
      `;
      return { active, deleted };
    });
  }

  async listFixedTimeConstraints(userId: string, start: Date, end: Date): Promise<readonly FixedTimeConstraint[]> {
    const rows = await this.sql<{ id: string; valid_from: Date; valid_until: Date; value: Record<string, unknown>; ownership: "external" | "amber_managed" }[]>`
      select c.id,c.valid_from,c.valid_until,c.value,r.ownership
      from public.constraints c join public.external_references r
        on r.user_id=c.user_id and r.internal_entity_type='constraint' and r.internal_entity_id=c.id
      where c.user_id=${userId} and r.source=${GOOGLE_CALENDAR_SOURCE} and r.sync_status='active'
        and c.valid_from<${end} and c.valid_until>${start}
        and coalesce(c.value->>'blocksCapacity','false')='true' and r.ownership='external'
      order by c.valid_from
    `;
    return rows.map((row) => ({
      id: row.id,
      externalEventId: String(row.value.externalEventId),
      title: String(row.value.title ?? ""),
      start: row.valid_from,
      end: row.valid_until,
      allDay: row.value.allDay === true,
      timeZone: String(row.value.timeZone),
      blocksCapacity: true,
      ownership: row.ownership
    }));
  }

  private async reconcileEvent(tx: Sql, input: ApplyCalendarSyncInput, event: NormalizedCalendarEvent, identity: string): Promise<"active" | "deleted" | "unchanged"> {
    const dedupeKey = `${GOOGLE_CALENDAR_SOURCE}:${identity}:${event.externalVersion}:${event.contentHash}`;
    const inbox = await tx<{ id: string }[]>`
      insert into public.inbox_items(user_id,source,external_id,external_version,raw_payload,content_hash,received_at,observed_at,dedupe_key,provenance,parse_status,correlation_id)
      values (${input.account.userId},${GOOGLE_CALENDAR_SOURCE},${identity},${event.externalVersion},${tx.json(event as postgres.JSONValue)},${event.contentHash},${input.synchronizedAt},${input.synchronizedAt},${dedupeKey},${GOOGLE_CALENDAR_SOURCE},'parsed',gen_random_uuid())
      on conflict(user_id,dedupe_key) do nothing returning id
    `;
    if (!inbox[0]) {
      await tx`
        update public.external_references set last_seen_at=${input.synchronizedAt}
        where user_id=${input.account.userId} and source=${GOOGLE_CALENDAR_SOURCE}
          and external_type='calendar_event' and external_id=${identity}
      `;
      return "unchanged";
    }
    const existing = await tx<ReferenceRow[]>`
      select id,internal_entity_id,ownership from public.external_references
      where user_id=${input.account.userId} and source=${GOOGLE_CALENDAR_SOURCE} and external_type='calendar_event' and external_id=${identity}
      for update
    `;
    if (event.status === "cancelled") {
      if (existing[0]) await this.tombstone(tx, input.account.userId, existing[0], input.synchronizedAt);
      await this.finishSignal(
        tx, input.account.userId, inbox[0].id, event, existing[0]?.id ?? null,
        input.synchronizedAt, existing[0]?.internal_entity_id
      );
      return existing[0] ? "deleted" : "unchanged";
    }
    const value = constraintValue(event, existing[0]?.ownership ?? "external", "active");
    let referenceId: string;
    let constraintId: string;
    if (existing[0]) {
      referenceId = existing[0].id;
      constraintId = existing[0].internal_entity_id;
      await tx`update public.constraints set value=${tx.json(value)},hardness='hard',valid_from=${new Date(event.start)},valid_until=${new Date(event.end)},reason='Google Calendar fixed event',origin=${GOOGLE_CALENDAR_SOURCE} where id=${constraintId} and user_id=${input.account.userId}`;
      await tx`update public.external_references set external_version=${event.externalVersion},content_hash=${event.contentHash},sync_status='active',last_seen_at=${input.synchronizedAt},deleted_at=null where id=${referenceId} and user_id=${input.account.userId}`;
    } else {
      const constraints = await tx<{ id: string }[]>`insert into public.constraints(user_id,constraint_type,value,hardness,valid_from,valid_until,reason,origin) values (${input.account.userId},'availability',${tx.json(value)},'hard',${new Date(event.start)},${new Date(event.end)},'Google Calendar fixed event',${GOOGLE_CALENDAR_SOURCE}) returning id`;
      constraintId = constraints[0]!.id;
      const references = await tx<{ id: string }[]>`insert into public.external_references(user_id,source,external_type,external_id,external_version,ownership,content_hash,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at) values (${input.account.userId},${GOOGLE_CALENDAR_SOURCE},'calendar_event',${identity},${event.externalVersion},'external',${event.contentHash},'constraint',${constraintId},'active',${input.synchronizedAt},${input.synchronizedAt}) returning id`;
      referenceId = references[0]!.id;
    }
    await this.finishSignal(tx, input.account.userId, inbox[0].id, event, referenceId, input.synchronizedAt, constraintId);
    return "active";
  }

  private async finishSignal(tx: Sql, userId: string, inboxId: string, event: NormalizedCalendarEvent, referenceId: string | null, at: Date, constraintId?: string): Promise<void> {
    const commandKey = `calendar-event:${externalIdentity(event)}:${event.externalVersion}:${event.contentHash}`;
    const commands = await tx<{ id: string; correlation_id: string }[]>`
      insert into public.domain_commands(user_id,command_type,payload,idempotency_key,correlation_id,status,result_entity_type,result_entity_id,applied_at)
      select ${userId},'RECONCILE_CALENDAR_EVENT',${tx.json({ event } as postgres.JSONValue)},${commandKey},correlation_id,'applied','external_reference',${referenceId},${at}
      from public.inbox_items where id=${inboxId} and user_id=${userId} returning id,correlation_id
    `;
    const parsed = await tx<{ id: string }[]>`
      insert into public.parsed_entities(user_id,inbox_item_id,entity_type,structured_data,confidence,requires_confirmation,processing_status,domain_command_id)
      values (${userId},${inboxId},'fixed_calendar_event',${tx.json(event as postgres.JSONValue)},1,false,'applied',${commands[0]!.id}) returning id
    `;
    await tx`update public.inbox_items set parse_status='applied' where id=${inboxId} and user_id=${userId}`;
    if (constraintId) {
      await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload) values (${userId},'external_calendar_event_reconciled','constraint',${constraintId},'integration',${at},${commands[0]!.correlation_id},${`calendar-command:${commands[0]!.id}`},1,${tx.json({ source: GOOGLE_CALENDAR_SOURCE, externalReferenceId: referenceId, parsedEntityId: parsed[0]!.id } as postgres.JSONValue)})`;
    }
  }

  private async tombstone(tx: Sql, userId: string, reference: ReferenceRow, at: Date): Promise<void> {
    await tx`update public.external_references set sync_status='deleted',last_seen_at=${at},deleted_at=${at} where id=${reference.id} and user_id=${userId}`;
    await tx`update public.constraints set value=jsonb_set(jsonb_set(value,'{syncStatus}','"deleted"'),'{blocksCapacity}','false') where id=${reference.internal_entity_id} and user_id=${userId}`;
  }

  private async tombstoneMissing(tx: Sql, input: ApplyCalendarSyncInput, seen: ReadonlySet<string>): Promise<number> {
    const refs = await tx<ReferenceRow[]>`
      select r.id,r.internal_entity_id,r.ownership from public.external_references r join public.constraints c on c.id=r.internal_entity_id and c.user_id=r.user_id
      where r.user_id=${input.account.userId} and r.source=${GOOGLE_CALENDAR_SOURCE} and r.external_type='calendar_event' and r.sync_status='active'
        and c.value->>'calendarId'=${input.account.calendarId} and c.valid_from<${input.window.end} and c.valid_until>${input.window.start}
    `;
    let deleted = 0;
    for (const reference of refs) {
      const ids = await tx<{ external_id: string }[]>`select external_id from public.external_references where id=${reference.id}`;
      if (!seen.has(ids[0]!.external_id)) {
        await this.tombstone(tx, input.account.userId, reference, input.synchronizedAt);
        await tx`
          insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
          values (${input.account.userId},'external_calendar_event_reconciled','constraint',${reference.internal_entity_id},'integration',${input.synchronizedAt},gen_random_uuid(),${`calendar-full-missing:${input.account.id}:${input.nextSyncToken}:${reference.id}`},1,${tx.json({ source: GOOGLE_CALENDAR_SOURCE, syncStatus: "deleted", reason: "missing_from_full_sync" } as postgres.JSONValue)})
          on conflict(user_id,idempotency_key) do nothing
        `;
        deleted += 1;
      }
    }
    return deleted;
  }
}

function externalIdentity(event: NormalizedCalendarEvent): string {
  return `${event.calendarId}:${event.externalEventId}`;
}

function constraintValue(event: NormalizedCalendarEvent, ownership: "external" | "amber_managed", syncStatus: string): postgres.JSONValue {
  return {
    source: GOOGLE_CALENDAR_SOURCE,
    calendarId: event.calendarId,
    externalEventId: event.externalEventId,
    title: event.title,
    allDay: event.allDay,
    timeZone: event.timeZone,
    recurringEventId: event.recurringEventId,
    originalStart: event.originalStart,
    transparency: event.transparency,
    visibility: event.visibility,
    ownership,
    syncStatus,
    blocksCapacity: event.transparency !== "transparent" && ownership === "external"
  };
}
