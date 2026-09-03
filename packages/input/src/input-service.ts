import { DomainError, SystemIdGenerator, type IdGenerator, type TaskId } from "@amber/shared";
import type { TaskService } from "@amber/core";
import { ZodError } from "zod";
import type { AIInterpreter } from "./ai-interpreter.js";
import {
  manualTextInputSchema,
  parsedTaskDraftSchema,
  parseResultSchema,
  type ManualTextInputValue,
  type ParsedTaskDraft,
  type Provenance
} from "./contracts.js";
import { applyExplicitTaskFacts, extractExplicitTaskFacts } from "./deterministic-facts.js";
import type { ExistingInputResult, InputRepositories } from "./repositories.js";

export type InputProcessingResult =
  | { readonly status: "pending"; readonly inboxItemId: string; readonly duplicate: true }
  | { readonly status: "waiting_for_confirmation"; readonly inboxItemId: string; readonly parsedEntityId: string; readonly questions: readonly string[]; readonly duplicate: boolean }
  | { readonly status: "applied"; readonly inboxItemId: string; readonly parsedEntityId: string; readonly commandId: string; readonly taskId: TaskId; readonly duplicate: boolean }
  | { readonly status: "failed"; readonly inboxItemId: string; readonly duplicate: true };

export class InputService {
  constructor(
    private readonly repositories: InputRepositories,
    private readonly interpreter: AIInterpreter,
    private readonly taskService: TaskService,
    private readonly ids: IdGenerator = new SystemIdGenerator()
  ) {}

  async processManualText(rawInput: ManualTextInputValue): Promise<InputProcessingResult> {
    const parsedInput = manualTextInputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new DomainError("INVALID_INPUT", "Manual input validation failed", { issues: parsedInput.error.issues });
    }
    const input = parsedInput.data;
    const dedupeKey = `manual:${input.clientRequestId}`;
    const correlationId = this.ids.generateCorrelationId();
    const inbox = await this.repositories.createOrGetManualInbox({
      userId: input.userId,
      text: input.text,
      receivedAt: new Date(input.receivedAt),
      dedupeKey,
      correlationId
    });
    if (!inbox.created) return this.existingResult(await this.repositories.getExistingInputResult(input.userId, inbox.item.id));

    const timeZone = await this.repositories.getUserTimeZone(input.userId);
    if (!timeZone) {
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      throw new DomainError("CROSS_USER_ACCESS", "User profile was not found");
    }

    let rawParseResult: unknown;
    try {
      rawParseResult = await this.interpreter.parseInput({
        text: input.text,
        userId: input.userId,
        receivedAt: input.receivedAt,
        timeZone,
        source: "manual"
      });
    } catch (error) {
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      if (error instanceof ZodError) throw new DomainError("PARSE_INVALID", "Interpreter output failed schema validation", { issues: error.issues });
      if (error instanceof DomainError) throw error;
      throw new DomainError("PARSE_FAILED", "Interpreter failed to parse input", { cause: error instanceof Error ? error.message : String(error) });
    }
    const validated = parseResultSchema.safeParse(rawParseResult);
    if (!validated.success) {
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      throw new DomainError("PARSE_INVALID", "Interpreter output failed schema validation", { issues: validated.error.issues });
    }
    const parseResult = validated.data;
    if (parseResult.intent !== "CREATE_TASK") {
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      throw new DomainError("UNSUPPORTED_INTENT", `Intent ${parseResult.intent} is not supported in v0.1`);
    }

    const taskEntity = parseResult.entities.find((entity) => entity.entityType === "task_candidate");
    const draftResult = parsedTaskDraftSchema.safeParse(taskEntity?.data);
    if (!taskEntity || !draftResult.success) {
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      throw new DomainError("PARSE_INVALID", "CREATE_TASK requires one valid task_candidate", {
        ...(!draftResult.success && { issues: draftResult.error.issues })
      });
    }
    const provenanceError = this.getProvenanceError(draftResult.data, taskEntity.provenance);
    if (provenanceError) {
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      throw new DomainError("PARSE_INVALID", provenanceError);
    }
    const explicit = extractExplicitTaskFacts(input.text, new Date(input.receivedAt), timeZone);
    const normalized = applyExplicitTaskFacts(draftResult.data, taskEntity.provenance, explicit);
    const requiresConfirmation = parseResult.requiresConfirmation || !normalized.draft.title.trim();
    const parsedEntity = await this.repositories.createTaskEntity({
      userId: input.userId,
      inboxItemId: inbox.item.id,
      draft: normalized.draft,
      provenance: normalized.provenance,
      confidence: taskEntity.confidence,
      requiresConfirmation,
      clarificationQuestions: parseResult.clarificationQuestions,
      status: "validated"
    });
    await this.repositories.setInboxStatus(input.userId, inbox.item.id, requiresConfirmation ? "waiting_for_confirmation" : "parsed");
    if (requiresConfirmation) {
      return {
        status: "waiting_for_confirmation",
        inboxItemId: inbox.item.id,
        parsedEntityId: parsedEntity.id,
        questions: parseResult.clarificationQuestions,
        duplicate: false
      };
    }

    const commandKey = `${dedupeKey}:CREATE_TASK:0`;
    const commandDraft: ParsedTaskDraft = {
      ...normalized.draft,
      importance: normalized.draft.importance ?? 3,
      executionMode: normalized.draft.executionMode ?? "standard"
    };
    const command = await this.repositories.createOrGetCreateTaskCommand({
      userId: input.userId,
      draft: commandDraft,
      provenance: this.withDefaultProvenance(normalized.draft, normalized.provenance),
      idempotencyKey: commandKey,
      correlationId: inbox.item.correlationId
    });
    await this.repositories.linkCommand(input.userId, parsedEntity.id, command.command.id);
    const eventKey = `domain-command:${command.command.id}`;
    const existingTaskId = command.command.resultEntityId as TaskId | null
      ?? await this.repositories.findTaskIdByEventIdempotencyKey(input.userId, eventKey);
    if (existingTaskId) {
      await this.markApplied(input.userId, inbox.item.id, parsedEntity.id, command.command.id, existingTaskId);
      return { status: "applied", inboxItemId: inbox.item.id, parsedEntityId: parsedEntity.id, commandId: command.command.id, taskId: existingTaskId, duplicate: !command.created };
    }

    try {
      const task = await this.taskService.createTask({
        userId: input.userId,
        title: commandDraft.title,
        description: commandDraft.description,
        executionMode: commandDraft.executionMode!,
        officialDeadline: commandDraft.officialDeadline ? new Date(commandDraft.officialDeadline) : undefined,
        estimatedMinutes: commandDraft.estimatedMinutes,
        importance: commandDraft.importance!,
        source: "manual",
        correlationId: inbox.item.correlationId,
        idempotencyKey: eventKey
      });
      await this.markApplied(input.userId, inbox.item.id, parsedEntity.id, command.command.id, task.id);
      return { status: "applied", inboxItemId: inbox.item.id, parsedEntityId: parsedEntity.id, commandId: command.command.id, taskId: task.id, duplicate: false };
    } catch (error) {
      const recovered = await this.repositories.findTaskIdByEventIdempotencyKey(input.userId, eventKey);
      if (recovered) {
        await this.markApplied(input.userId, inbox.item.id, parsedEntity.id, command.command.id, recovered);
        return { status: "applied", inboxItemId: inbox.item.id, parsedEntityId: parsedEntity.id, commandId: command.command.id, taskId: recovered, duplicate: true };
      }
      await this.repositories.markCommandFailed(input.userId, command.command.id);
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      throw error;
    }
  }

  private existingResult(existing: ExistingInputResult): InputProcessingResult {
    if (existing.command?.status === "applied" && existing.command.resultEntityId && existing.parsedEntity) {
      return { status: "applied", inboxItemId: existing.inboxItem.id, parsedEntityId: existing.parsedEntity.id, commandId: existing.command.id, taskId: existing.command.resultEntityId as TaskId, duplicate: true };
    }
    if (existing.inboxItem.parseStatus === "waiting_for_confirmation" && existing.parsedEntity) {
      return { status: "waiting_for_confirmation", inboxItemId: existing.inboxItem.id, parsedEntityId: existing.parsedEntity.id, questions: [], duplicate: true };
    }
    if (existing.inboxItem.parseStatus === "failed") return { status: "failed", inboxItemId: existing.inboxItem.id, duplicate: true };
    return { status: "pending", inboxItemId: existing.inboxItem.id, duplicate: true };
  }

  private getProvenanceError(draft: ParsedTaskDraft, provenance: Record<string, Provenance>): string | null {
    const presentFields = Object.entries(draft)
      .filter(([field, value]) => field !== "inferredFields" && value !== undefined)
      .map(([field]) => field);
    const missing = presentFields.find((field) => provenance[field] === undefined);
    if (missing) return `Field ${missing} lacks provenance`;
    const invalid = draft.inferredFields.find((field) => provenance[field] !== "ai_inferred");
    if (invalid) return `Inferred field ${invalid} lacks ai_inferred provenance`;
    const unmarked = presentFields.find((field) => provenance[field] === "ai_inferred" && !draft.inferredFields.includes(field));
    return unmarked ? `AI inferred field ${unmarked} is absent from inferredFields` : null;
  }

  private withDefaultProvenance(draft: ParsedTaskDraft, provenance: Record<string, Provenance>): Record<string, Provenance> {
    return {
      ...provenance,
      importance: provenance.importance ?? (draft.importance === undefined ? "system_derived" : "ai_inferred"),
      executionMode: provenance.executionMode ?? (draft.executionMode === undefined ? "system_derived" : "ai_inferred")
    };
  }

  private async markApplied(userId: Parameters<InputRepositories["markCommandApplied"]>[0], inboxId: string, entityId: string, commandId: string, taskId: TaskId): Promise<void> {
    await this.repositories.markCommandApplied(userId, commandId, taskId);
    await this.repositories.setParsedEntityStatus(userId, entityId, "applied");
    await this.repositories.setInboxStatus(userId, inboxId, "applied");
  }
}
