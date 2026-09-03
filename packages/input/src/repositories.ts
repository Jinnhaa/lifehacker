import type { CorrelationId, TaskId, UserId } from "@amber/shared";
import type { ParsedTaskDraft, Provenance } from "./contracts.js";

export type InboxParseStatus = "pending" | "parsed" | "waiting_for_confirmation" | "applied" | "failed";
export type ParsedEntityStatus = "parsed" | "validated" | "rejected" | "applied";
export type DomainCommandStatus = "pending" | "applied" | "rejected" | "failed";

export interface InboxItem {
  readonly id: string;
  readonly userId: UserId;
  readonly rawContent: string;
  readonly dedupeKey: string;
  readonly parseStatus: InboxParseStatus;
  readonly correlationId: CorrelationId;
}

export interface ParsedEntity {
  readonly id: string;
  readonly inboxItemId: string;
  readonly processingStatus: ParsedEntityStatus;
  readonly domainCommandId: string | null;
}

export interface DomainCommand {
  readonly id: string;
  readonly userId: UserId;
  readonly status: DomainCommandStatus;
  readonly resultEntityType: string | null;
  readonly resultEntityId: string | null;
}

export interface ExistingInputResult {
  readonly inboxItem: InboxItem;
  readonly parsedEntity: ParsedEntity | null;
  readonly command: DomainCommand | null;
}

export interface InboxItemRepository {
  getUserTimeZone(userId: UserId): Promise<string | null>;
  createOrGetManualInbox(input: {
    userId: UserId;
    text: string;
    receivedAt: Date;
    dedupeKey: string;
    correlationId: CorrelationId;
  }): Promise<{ item: InboxItem; created: boolean }>;
  getExistingInputResult(userId: UserId, inboxItemId: string): Promise<ExistingInputResult>;
  setInboxStatus(userId: UserId, inboxItemId: string, status: InboxParseStatus): Promise<void>;
}

export interface ParsedEntityRepository {
  createTaskEntity(input: {
    userId: UserId;
    inboxItemId: string;
    draft: ParsedTaskDraft;
    provenance: Record<string, Provenance>;
    confidence: number;
    requiresConfirmation: boolean;
    clarificationQuestions: readonly string[];
    status: ParsedEntityStatus;
  }): Promise<ParsedEntity>;
  linkCommand(userId: UserId, entityId: string, commandId: string): Promise<void>;
  setParsedEntityStatus(userId: UserId, entityId: string, status: ParsedEntityStatus): Promise<void>;
}

export interface DomainCommandRepository {
  createOrGetCreateTaskCommand(input: {
    userId: UserId;
    draft: ParsedTaskDraft;
    provenance: Record<string, Provenance>;
    idempotencyKey: string;
    correlationId: CorrelationId;
  }): Promise<{ command: DomainCommand; created: boolean }>;
  findTaskIdByEventIdempotencyKey(userId: UserId, idempotencyKey: string): Promise<TaskId | null>;
  markCommandApplied(userId: UserId, commandId: string, taskId: TaskId): Promise<void>;
  markCommandFailed(userId: UserId, commandId: string): Promise<void>;
}

export type InputRepositories = InboxItemRepository & ParsedEntityRepository & DomainCommandRepository;
