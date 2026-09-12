import type { CorrelationId, TaskId, UserId } from "@amber/shared";
import postgres, { type Sql } from "postgres";
import type { DiscoveredWorkItem, InputSource, ParsedTaskDraft, Provenance } from "./contracts.js";
import type { TaskContextResolution } from "./context-resolution.js";
import type {
  DomainCommand,
  DomainCommandRepository,
  DomainCommandStatus,
  ExistingInputResult,
  InboxItem,
  InboxItemRepository,
  InboxParseStatus,
  ParsedEntity,
  ParsedEntityRepository,
  ParsedEntityStatus,
  PendingTaskConfirmation
} from "./repositories.js";

interface InboxRow { id: string; user_id: string; source: string; raw_content: string; dedupe_key: string; parse_status: string; correlation_id: string }
interface ParsedRow { id: string; inbox_item_id: string; processing_status: string; domain_command_id: string | null; structured_data: unknown; confidence: string | number; created_at: Date }
interface CommandRow { id: string; user_id: string; status: string; result_entity_type: string | null; result_entity_id: string | null }

const mapInbox = (row: InboxRow): InboxItem => ({
  id: row.id, userId: row.user_id as UserId, source: row.source, rawContent: row.raw_content,
  dedupeKey: row.dedupe_key, parseStatus: row.parse_status as InboxParseStatus,
  correlationId: row.correlation_id as CorrelationId
});
const mapParsed = (row: ParsedRow): ParsedEntity => ({
  id: row.id, inboxItemId: row.inbox_item_id, processingStatus: row.processing_status as ParsedEntityStatus,
  domainCommandId: row.domain_command_id
});
const mapCommand = (row: CommandRow): DomainCommand => ({
  id: row.id, userId: row.user_id as UserId, status: row.status as DomainCommandStatus,
  resultEntityType: row.result_entity_type, resultEntityId: row.result_entity_id
});

export class SupabaseInputRepository
implements InboxItemRepository, ParsedEntityRepository, DomainCommandRepository {
  constructor(private readonly sql: Sql) {}

  static connect(connectionString: string): SupabaseInputRepository {
    return new SupabaseInputRepository(postgres(connectionString, { max: 10 }));
  }

  async close(): Promise<void> { await this.sql.end(); }

  async getUserTimeZone(userId: UserId): Promise<string | null> {
    const rows = await this.sql<{ timezone: string }[]>`select timezone from public.profiles where id=${userId}`;
    return rows[0]?.timezone ?? null;
  }

  async createOrGetTextInbox(input: {
    userId: UserId; text: string; source: InputSource; receivedAt: Date; dedupeKey: string; correlationId: CorrelationId;
  }): Promise<{ item: InboxItem; created: boolean }> {
    const inserted = await this.sql<InboxRow[]>`
      insert into public.inbox_items(
        user_id,source,raw_content,received_at,dedupe_key,provenance,parse_status,correlation_id
      ) values (${input.userId},${input.source},${input.text},${input.receivedAt},${input.dedupeKey},'user_explicit','pending',${input.correlationId})
      on conflict(user_id,dedupe_key) do nothing returning *
    `;
    if (inserted[0]) return { item: mapInbox(inserted[0]), created: true };
    const existing = await this.sql<InboxRow[]>`
      select * from public.inbox_items where user_id=${input.userId} and dedupe_key=${input.dedupeKey}
    `;
    return { item: mapInbox(existing[0]!), created: false };
  }

  async createOrGetDiscoveredInbox(input: {
    userId: UserId; item: DiscoveredWorkItem; dedupeKey: string; correlationId: CorrelationId; contentHash: string;
  }): Promise<{ item: InboxItem; created: boolean }> {
    const payload = { ...input.item.rawPayload, sourceUrl: input.item.sourceUrl, sourceStatus: input.item.status };
    const inserted = await this.sql<InboxRow[]>`
      insert into public.inbox_items(
        user_id,source,external_id,external_version,raw_content,raw_payload,content_hash,received_at,observed_at,
        dedupe_key,provenance,parse_status,correlation_id
      ) values (${input.userId},${input.item.source},${input.item.sourceItemId},${input.item.sourceVersion},${input.item.title},
        ${this.sql.json(payload as postgres.JSONValue)},${input.contentHash},${input.item.observedAt},${input.item.observedAt},
        ${input.dedupeKey},'external','pending',${input.correlationId})
      on conflict(user_id,dedupe_key) do nothing returning *
    `;
    if (inserted[0]) return { item: mapInbox(inserted[0]), created: true };
    const rows = await this.sql<InboxRow[]>`
      update public.inbox_items set external_version=${input.item.sourceVersion},raw_payload=${this.sql.json(payload as postgres.JSONValue)},
        content_hash=${input.contentHash},observed_at=${input.item.observedAt}
      where user_id=${input.userId} and dedupe_key=${input.dedupeKey} returning *
    `;
    return { item: mapInbox(rows[0]!), created: false };
  }

  async getExistingInputResult(userId: UserId, inboxItemId: string): Promise<ExistingInputResult> {
    const inbox = await this.sql<InboxRow[]>`select * from public.inbox_items where id=${inboxItemId} and user_id=${userId}`;
    const parsed = await this.sql<ParsedRow[]>`
      select * from public.parsed_entities where inbox_item_id=${inboxItemId} and user_id=${userId} order by created_at limit 1
    `;
    const command = parsed[0]?.domain_command_id
      ? await this.sql<CommandRow[]>`select * from public.domain_commands where id=${parsed[0].domain_command_id} and user_id=${userId}`
      : [];
    return { inboxItem: mapInbox(inbox[0]!), parsedEntity: parsed[0] ? mapParsed(parsed[0]) : null, command: command[0] ? mapCommand(command[0]) : null };
  }

  async setInboxStatus(userId: UserId, inboxItemId: string, status: InboxParseStatus): Promise<void> {
    await this.sql`update public.inbox_items set parse_status=${status} where id=${inboxItemId} and user_id=${userId}`;
  }

  async createTaskEntity(input: {
    userId: UserId; inboxItemId: string; draft: ParsedTaskDraft; provenance: Record<string, Provenance>;
    confidence: number; resolution: TaskContextResolution; requiresConfirmation: boolean; clarificationQuestions: readonly string[]; status: ParsedEntityStatus;
  }): Promise<ParsedEntity> {
    const structured = { data: input.draft, provenance: input.provenance, resolution: input.resolution, clarificationQuestions: input.clarificationQuestions };
    const rows = await this.sql<ParsedRow[]>`
      insert into public.parsed_entities(
        user_id,inbox_item_id,entity_type,structured_data,confidence,requires_confirmation,processing_status
      ) values (${input.userId},${input.inboxItemId},'task_candidate',${this.sql.json(structured as unknown as postgres.JSONValue)},
        ${input.confidence},${input.requiresConfirmation},${input.status}) returning *
    `;
    return mapParsed(rows[0]!);
  }

  async listPendingTaskConfirmations(userId: UserId): Promise<readonly PendingTaskConfirmation[]> {
    const rows = await this.sql<(ParsedRow & InboxRow & { parsed_id: string; inbox_id: string; parsed_created_at: Date })[]>`
      select p.*,p.id as parsed_id,p.created_at as parsed_created_at,i.*,i.id as inbox_id
      from public.parsed_entities p join public.inbox_items i on i.id=p.inbox_item_id and i.user_id=p.user_id
      where p.user_id=${userId} and p.entity_type='task_candidate' and p.requires_confirmation=true
        and p.processing_status='validated' and i.parse_status='waiting_for_confirmation'
      order by p.created_at
    `;
    return rows.map((row) => {
      const structured = row.structured_data as { data: ParsedTaskDraft; provenance: Record<string, Provenance>; clarificationQuestions?: string[] };
      return {
        inboxItem: mapInbox({ ...row, id: row.inbox_id }), parsedEntityId: row.parsed_id,
        draft: structured.data, provenance: structured.provenance, confidence: Number(row.confidence),
        clarificationQuestions: structured.clarificationQuestions ?? [], createdAt: new Date(row.parsed_created_at)
      };
    });
  }

  async updateTaskEntity(input: {
    userId: UserId; entityId: string; draft: ParsedTaskDraft; provenance: Record<string, Provenance>;
    resolution: TaskContextResolution; requiresConfirmation: boolean; clarificationQuestions: readonly string[];
  }): Promise<void> {
    const structured = { data: input.draft, provenance: input.provenance, resolution: { ...input.resolution }, clarificationQuestions: [...input.clarificationQuestions] };
    await this.sql`update public.parsed_entities set structured_data=${this.sql.json(structured as unknown as postgres.JSONValue)},
      requires_confirmation=${input.requiresConfirmation} where id=${input.entityId} and user_id=${input.userId}`;
  }

  async getContextCandidates(userId: UserId) {
    const workContexts = await this.sql<{ id: string; title: string; kind: "project" | "course" }[]>`
      select id,title,kind from public.work_contexts where user_id=${userId} and status <> 'archived'
    `;
    const objectives = await this.sql<{ id: string; title: string; work_context_id: string | null }[]>`
      select id,title,work_context_id from public.objectives where user_id=${userId} and status <> 'completed'
    `;
    return { workContexts, objectives: objectives.map((row) => ({ id: row.id, title: row.title, workContextId: row.work_context_id })) };
  }

  async linkCommand(userId: UserId, entityId: string, commandId: string): Promise<void> {
    await this.sql`update public.parsed_entities set domain_command_id=${commandId} where id=${entityId} and user_id=${userId}`;
  }

  async setParsedEntityStatus(userId: UserId, entityId: string, status: ParsedEntityStatus): Promise<void> {
    await this.sql`update public.parsed_entities set processing_status=${status} where id=${entityId} and user_id=${userId}`;
  }

  async createOrGetCreateTaskCommand(input: {
    userId: UserId; draft: ParsedTaskDraft; provenance: Record<string, Provenance>; resolution: TaskContextResolution; idempotencyKey: string; correlationId: CorrelationId;
  }): Promise<{ command: DomainCommand; created: boolean }> {
    const payload = { task: input.draft, provenance: input.provenance, resolution: { ...input.resolution } };
    const inserted = await this.sql<CommandRow[]>`
      insert into public.domain_commands(user_id,command_type,payload,idempotency_key,correlation_id,status)
      values (${input.userId},'CREATE_TASK',${this.sql.json(payload as unknown as postgres.JSONValue)},${input.idempotencyKey},${input.correlationId},'pending')
      on conflict(user_id,idempotency_key) do nothing returning *
    `;
    if (inserted[0]) return { command: mapCommand(inserted[0]), created: true };
    const existing = await this.sql<CommandRow[]>`
      select * from public.domain_commands where user_id=${input.userId} and idempotency_key=${input.idempotencyKey}
    `;
    return { command: mapCommand(existing[0]!), created: false };
  }

  async findCommandByIdempotencyKey(userId: UserId, idempotencyKey: string): Promise<DomainCommand | null> {
    const rows = await this.sql<CommandRow[]>`select * from public.domain_commands where user_id=${userId} and idempotency_key=${idempotencyKey}`;
    return rows[0] ? mapCommand(rows[0]) : null;
  }

  async upsertExternalReference(input: {
    userId: UserId; item: DiscoveredWorkItem; internalEntityType: "parsed_entity" | "task"; internalEntityId: string; contentHash: string;
  }): Promise<void> {
    const deleted = input.item.status === "deleted";
    await this.sql`
      insert into public.external_references(user_id,source,external_type,external_id,external_version,ownership,content_hash,
        internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at,deleted_at)
      values (${input.userId},${input.item.source},'notion_page',${input.item.sourceItemId},${input.item.sourceVersion},'external',
        ${input.contentHash},${input.internalEntityType},${input.internalEntityId},${deleted ? "deleted" : "active"},
        ${input.item.observedAt},${input.item.observedAt},${deleted ? input.item.observedAt : null})
      on conflict(user_id,source,external_type,external_id) do update set
        external_version=excluded.external_version,content_hash=excluded.content_hash,
        internal_entity_type=excluded.internal_entity_type,internal_entity_id=excluded.internal_entity_id,
        sync_status=excluded.sync_status,last_seen_at=excluded.last_seen_at,deleted_at=excluded.deleted_at
    `;
  }

  async promoteExternalReferences(userId: UserId, parsedEntityId: string, taskId: TaskId): Promise<void> {
    await this.sql`update public.external_references set internal_entity_type='task',internal_entity_id=${taskId}
      where user_id=${userId} and internal_entity_type='parsed_entity' and internal_entity_id=${parsedEntityId}`;
  }

  async findTaskIdByEventIdempotencyKey(userId: UserId, idempotencyKey: string): Promise<TaskId | null> {
    const rows = await this.sql<{ aggregate_id: string }[]>`
      select aggregate_id from public.domain_events where user_id=${userId} and idempotency_key=${idempotencyKey} and aggregate_type='task'
    `;
    return rows[0] ? rows[0].aggregate_id as TaskId : null;
  }

  async markCommandApplied(userId: UserId, commandId: string, taskId: TaskId): Promise<void> {
    await this.sql`
      update public.domain_commands set status='applied',result_entity_type='task',result_entity_id=${taskId},applied_at=now()
      where id=${commandId} and user_id=${userId}
    `;
  }

  async markCommandFailed(userId: UserId, commandId: string): Promise<void> {
    await this.sql`update public.domain_commands set status='failed' where id=${commandId} and user_id=${userId}`;
  }
}
