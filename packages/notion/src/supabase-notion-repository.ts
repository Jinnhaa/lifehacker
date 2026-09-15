import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { UserId } from "@amber/shared";
import { NOTION_SOURCE, type NotionIntegrationAccount } from "./contracts.js";
import type { NotionUniversityCourse } from "./notion-client.js";

export interface UniversityCourseConnection {
  readonly created: boolean;
  readonly matchedSnowboard: boolean;
}

export class SupabaseNotionRepository {
  constructor(private readonly sql: Sql) {}

  async getActiveAccount(userId: string): Promise<NotionIntegrationAccount | null> {
    const rows = await this.sql<{ id: string; user_id: string; secret_ref: string | null; metadata: Record<string, unknown> }[]>`
      select id,user_id,secret_ref,metadata from public.integration_accounts
      where user_id=${userId} and provider=${NOTION_SOURCE} and status='active' order by created_at limit 2
    `;
    if (rows.length !== 1 || !rows[0]!.secret_ref) return null;
    const sourceIds = rows[0]!.metadata.sourceIds;
    if (!Array.isArray(sourceIds) || !sourceIds.every((value) => typeof value === "string" && value.trim())) return null;
    return { id: rows[0]!.id, userId: rows[0]!.user_id as UserId, secretRef: rows[0]!.secret_ref, sourceIds };
  }

  async markSynced(accountId: string, userId: string, at: Date): Promise<void> {
    await this.sql`update public.integration_accounts set last_sync_at=${at} where id=${accountId} and user_id=${userId}`;
  }

  async hasTaskReference(userId: UserId, externalId: string): Promise<boolean> {
    const rows = await this.sql<{ internal_entity_id: string }[]>`
      select internal_entity_id from public.external_references
      where user_id=${userId} and source='notion' and external_type='notion_page' and external_id=${externalId}
        and internal_entity_type='task'
      limit 1
    `;
    return rows.length > 0;
  }

  async dismissPendingChecklistItem(userId: UserId, externalId: string): Promise<boolean> {
    const rows = await this.sql<{ parsed_id: string; inbox_id: string }[]>`
      select p.id as parsed_id,i.id as inbox_id
      from public.inbox_items i join public.parsed_entities p on p.inbox_item_id=i.id and p.user_id=i.user_id
      where i.user_id=${userId} and i.dedupe_key=${`notion:${externalId}`}
        and i.parse_status='waiting_for_confirmation' and p.processing_status='validated'
      limit 1
    `;
    const pending = rows[0];
    if (!pending) return false;
    await this.sql.begin(async (transaction) => {
      await transaction`update public.parsed_entities set processing_status='rejected',requires_confirmation=false where id=${pending.parsed_id} and user_id=${userId}`;
      await transaction`update public.inbox_items set parse_status='applied' where id=${pending.inbox_id} and user_id=${userId}`;
    });
    return true;
  }

  async connectUniversityCourse(userId: UserId, course: NotionUniversityCourse, currentTerm: string): Promise<UniversityCourseConnection> {
    return this.sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext(${`${userId}:notion:course:${course.sourceItemId}`}))`;
      const reference = await transaction<{ internal_entity_type: string; internal_entity_id: string }[]>`
        select internal_entity_type,internal_entity_id from public.external_references
        where user_id=${userId} and source='notion' and external_type='course' and external_id=${course.sourceItemId}
      `;
      let workContextId: string;
      let created = false;
      if (reference[0]) {
        if (reference[0].internal_entity_type !== 'work_context') throw new Error(`Notion course ${course.sourceItemId} is not linked to a WorkContext`);
        workContextId = reference[0].internal_entity_id;
        const snowboardMatch = await this.findClearSnowboardCourse(transaction, userId, course.title);
        if (snowboardMatch && snowboardMatch.id !== workContextId) {
          const taskCount = await transaction<{ count: string }[]>`select count(*) from public.tasks where user_id=${userId} and work_context_id=${workContextId}`;
          if (Number(taskCount[0]?.count ?? 0) !== 0) throw new Error(`Notion course ${course.sourceItemId} has tasks and cannot be remapped automatically`);
          await transaction`update public.external_references set internal_entity_id=${snowboardMatch.id} where user_id=${userId} and source='notion' and external_type='course' and external_id=${course.sourceItemId}`;
          await transaction`update public.work_contexts set status='archived' where id=${workContextId} and user_id=${userId} and kind='course'`;
          workContextId = snowboardMatch.id;
        }
      } else {
        const snowboardMatch = await this.findClearSnowboardCourse(transaction, userId, course.title);
        if (snowboardMatch) workContextId = snowboardMatch.id;
        else {
        const exact = await transaction<{ id: string; has_snowboard: boolean }[]>`
          select w.id,exists(
            select 1 from public.external_references r
            where r.user_id=w.user_id and r.source='snowboard' and r.external_type='course'
              and r.internal_entity_type='work_context' and r.internal_entity_id=w.id
          ) as has_snowboard
          from public.work_contexts w
          where w.user_id=${userId} and w.kind='course' and w.status <> 'archived' and w.title=${course.title}
          order by w.created_at
        `;
        if (exact.length > 1) throw new Error(`Multiple exact Course WorkContexts match Notion course ${course.sourceItemId}`);
        if (exact[0]) workContextId = exact[0].id;
        else {
          workContextId = (await transaction<{ id: string }[]>`
            insert into public.work_contexts(user_id,kind,title,status,agent_mode)
            values (${userId},'course',${course.title},'active','not_applicable') returning id
          `)[0]!.id;
          created = true;
        }
        }
      }
      const snowboard = await transaction<{ exists: boolean }[]>`
        select exists(
          select 1 from public.external_references
          where user_id=${userId} and source='snowboard' and external_type='course'
            and internal_entity_type='work_context' and internal_entity_id=${workContextId}
        ) as exists
      `;
      const contentHash = createHash("sha256").update(JSON.stringify({ title: course.title, term: course.term, meetingDays: course.meetingDays, meetingTime: course.meetingTime, room: course.room, instructor: course.instructor })).digest("hex");
      await transaction`
        insert into public.course_profiles(work_context_id,user_id,term) values (${workContextId},${userId},${currentTerm})
        on conflict(work_context_id) do update set term=excluded.term,updated_at=now()
      `;
      await transaction`
        insert into public.external_references(user_id,source,external_type,external_id,external_version,ownership,content_hash,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at)
        values (${userId},'notion','course',${course.sourceItemId},${currentTerm},'external',${contentHash},'work_context',${workContextId},'active',${course.observedAt},${course.observedAt})
        on conflict(user_id,source,external_type,external_id) do update set
          external_version=excluded.external_version,content_hash=excluded.content_hash,sync_status='active',last_seen_at=excluded.last_seen_at,deleted_at=null
      `;
      return { created, matchedSnowboard: snowboard[0]?.exists === true };
    });
  }

  private async findClearSnowboardCourse(transaction: Sql, userId: UserId, title: string): Promise<{ id: string } | null> {
    const candidates = await transaction<{ id: string; title: string }[]>`
      select w.id,w.title from public.work_contexts w join public.external_references r
        on r.user_id=w.user_id and r.internal_entity_type='work_context' and r.internal_entity_id=w.id
      where w.user_id=${userId} and w.kind='course' and w.status <> 'archived'
        and r.source='snowboard' and r.external_type='course'
    `;
    const matches = candidates.filter((candidate) => courseTitleKey(candidate.title) === courseTitleKey(title));
    if (matches.length > 1) throw new Error(`Multiple Snowboard Course WorkContexts match Notion course ${title}`);
    return matches[0] ?? null;
  }
}

function courseTitleKey(value: string): string {
  return value.normalize("NFKC").replace(/\s*\([0-9]+\)\s*$/u, "").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}
