import type { CorrelationId, TaskId, UserId } from "@amber/shared";
import postgres, { type Sql } from "postgres";
import type { InputSource, ParsedTaskDraft, Provenance } from "./contracts.js";
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
  ParsedEntityStatus
} from "./repositories.js";

interface InboxRow { id: string; user_id: string; raw_content: string; dedupe_key: string; parse_status: string; correlation_id: string }
interface ParsedRow { id: string; inbox_item_id: string; processing_status: string; domain_command_id: string | null }
interface CommandRow { id: string; user_id: string; status: string; result_entity_type: string | null; result_entity_id: string | null }

const mapInbox = (row: InboxRow): InboxItem => ({
  id: row.id, userId: row.user_id as UserId, rawContent: row.raw_content,
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
    confidence: number; requiresConfirmation: boolean; clarificationQuestions: readonly string[]; status: ParsedEntityStatus;
  }): Promise<ParsedEntity> {
    const structured = { data: input.draft, provenance: input.provenance, clarificationQuestions: input.clarificationQuestions };
    const rows = await this.sql<ParsedRow[]>`
      insert into public.parsed_entities(
        user_id,inbox_item_id,entity_type,structured_data,confidence,requires_confirmation,processing_status
      ) values (${input.userId},${input.inboxItemId},'task_candidate',${this.sql.json(structured as postgres.JSONValue)},
        ${input.confidence},${input.requiresConfirmation},${input.status}) returning *
    `;
    return mapParsed(rows[0]!);
  }

  async linkCommand(userId: UserId, entityId: string, commandId: string): Promise<void> {
    await this.sql`update public.parsed_entities set domain_command_id=${commandId} where id=${entityId} and user_id=${userId}`;
  }

  async setParsedEntityStatus(userId: UserId, entityId: string, status: ParsedEntityStatus): Promise<void> {
    await this.sql`update public.parsed_entities set processing_status=${status} where id=${entityId} and user_id=${userId}`;
  }

  async createOrGetCreateTaskCommand(input: {
    userId: UserId; draft: ParsedTaskDraft; provenance: Record<string, Provenance>; idempotencyKey: string; correlationId: CorrelationId;
  }): Promise<{ command: DomainCommand; created: boolean }> {
    const payload = { task: input.draft, provenance: input.provenance };
    const inserted = await this.sql<CommandRow[]>`
      insert into public.domain_commands(user_id,command_type,payload,idempotency_key,correlation_id,status)
      values (${input.userId},'CREATE_TASK',${this.sql.json(payload as postgres.JSONValue)},${input.idempotencyKey},${input.correlationId},'pending')
      on conflict(user_id,idempotency_key) do nothing returning *
    `;
    if (inserted[0]) return { command: mapCommand(inserted[0]), created: true };
    const existing = await this.sql<CommandRow[]>`
      select * from public.domain_commands where user_id=${input.userId} and idempotency_key=${input.idempotencyKey}
    `;
    return { command: mapCommand(existing[0]!), created: false };
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
