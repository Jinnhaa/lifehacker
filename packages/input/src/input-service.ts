import { createHash } from "node:crypto";
import type { TaskService } from "@amber/core";
import { DomainError, SystemIdGenerator, type CorrelationId, type IdGenerator, type TaskId, type UserId } from "@amber/shared";
import { ZodError } from "zod";
import type { AIInterpreter } from "./ai-interpreter.js";
import { manualTextInputSchema, parsedTaskDraftSchema, parseResultSchema, textInputSchema, type DiscoveredWorkItem, type ManualTextInputValue, type ParsedTaskDraft, type Provenance, type TextInput, type TextInputValue } from "./contracts.js";
import { resolveTaskContext, type TaskContextResolution } from "./context-resolution.js";
import { applyExplicitTaskFacts, extractExplicitTaskFacts } from "./deterministic-facts.js";
import type { ExistingInputResult, InputRepositories, PendingTaskConfirmation } from "./repositories.js";

export type InputProcessingResult =
  | { readonly status: "pending"; readonly inboxItemId: string; readonly duplicate: true }
  | { readonly status: "waiting_for_confirmation"; readonly inboxItemId: string; readonly parsedEntityId: string; readonly questions: readonly string[]; readonly duplicate: boolean }
  | { readonly status: "applied"; readonly inboxItemId: string; readonly parsedEntityId: string; readonly commandId: string; readonly taskId: TaskId; readonly duplicate: boolean }
  | { readonly status: "failed"; readonly inboxItemId: string; readonly duplicate: true };

export type ConfirmationProcessingResult =
  | { readonly handled: false }
  | { readonly handled: true; readonly status: "needs_selection" | "needs_correction" | "dismissed" | "expired"; readonly message: string }
  | { readonly handled: true; readonly status: "applied"; readonly taskId: TaskId; readonly duplicate: boolean; readonly message: string };

export type WorkDiscoveryResult =
  | { readonly status: "needs_confirmation"; readonly inboxItemId: string; readonly parsedEntityId: string; readonly duplicate: boolean }
  | { readonly status: "materialized"; readonly inboxItemId: string; readonly parsedEntityId: string; readonly taskId: TaskId; readonly duplicate: boolean }
  | { readonly status: "dismissed"; readonly inboxItemId: string; readonly parsedEntityId: string; readonly duplicate: boolean };

const EMPTY_RESOLUTION: TaskContextResolution = { workContextId: null, objectiveId: null, ambiguous: false, ambiguity: null };
const CONFIRMATION_MAX_AGE_MS = 86_400_000;

export class InputService {
  constructor(private readonly repositories: InputRepositories, private readonly interpreter: AIInterpreter, private readonly taskService: TaskService, private readonly ids: IdGenerator = new SystemIdGenerator()) {}

  async processManualText(rawInput: ManualTextInputValue): Promise<InputProcessingResult> {
    const parsed = manualTextInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new DomainError("INVALID_INPUT", "Manual input validation failed", { issues: parsed.error.issues });
    return this.processValidatedText(parsed.data);
  }

  async processTextInput(rawInput: TextInputValue): Promise<InputProcessingResult> {
    const parsed = textInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new DomainError("INVALID_INPUT", "Text input validation failed", { issues: parsed.error.issues });
    return this.processValidatedText(parsed.data);
  }

  async processConfirmationReply(input: { readonly userId: UserId; readonly text: string; readonly receivedAt: Date; readonly clientRequestId: string }): Promise<ConfirmationProcessingResult> {
    const key = `discord:${input.clientRequestId}:CONFIRM_TASK`;
    const existing = await this.repositories.findCommandByIdempotencyKey(input.userId, key);
    if (existing?.status === "applied" && existing.resultEntityId) return { handled: true, status: "applied", taskId: existing.resultEntityId as TaskId, duplicate: true, message: "이미 반영한 확인이야." };
    const pending = await this.repositories.listPendingTaskConfirmations(input.userId);
    const active: PendingTaskConfirmation[] = [];
    let expired = false;
    for (const candidate of pending) {
      if (input.receivedAt.getTime() - candidate.createdAt.getTime() > CONFIRMATION_MAX_AGE_MS) { expired = true; await this.dismissCandidate(input.userId, candidate); }
      else active.push(candidate);
    }
    if (!active.length) return expired ? { handled: true, status: "expired", message: "확인 대기 시간이 지나 종료했어. 할 일을 다시 보내줘." } : { handled: false };
    const text = input.text.trim();
    const selected = active.length === 1 ? active : active.filter((value) => text.includes(value.draft.title));
    if (selected.length !== 1) return { handled: true, status: "needs_selection", message: "확인할 항목이 여러 개야. 항목 제목을 함께 알려줘." };
    const candidate = selected[0]!;
    if (/^(?:이건\s*)?(?:할\s*일|작업)(?:이\s*)?아니야[.!]?$/u.test(text) || /^(취소|삭제|무시)[.!]?$/u.test(text)) {
      await this.dismissCandidate(input.userId, candidate);
      return { handled: true, status: "dismissed", message: "이 항목은 할 일로 만들지 않았어." };
    }
    const corrected = await this.applyConfirmationCorrection(input.userId, candidate, text, input.receivedAt);
    if (!corrected) return { handled: true, status: "needs_correction", message: "프로젝트명, 목표명, 마감일, 예상 시간 또는 ‘맞아’라고 알려줘." };
    const questions = this.questionsForResolution(corrected.resolution);
    if (corrected.resolution.ambiguous) {
      await this.repositories.updateTaskEntity({ userId: input.userId, entityId: candidate.parsedEntityId, ...corrected, requiresConfirmation: true, clarificationQuestions: questions });
      return { handled: true, status: "needs_correction", message: questions[0]! };
    }
    await this.repositories.updateTaskEntity({ userId: input.userId, entityId: candidate.parsedEntityId, ...corrected, requiresConfirmation: false, clarificationQuestions: [] });
    const result = await this.materialize({ userId: input.userId, inboxItemId: candidate.inboxItem.id, parsedEntityId: candidate.parsedEntityId, ...corrected, commandKey: key, correlationId: candidate.inboxItem.correlationId, source: candidate.inboxItem.source });
    return { handled: true, status: "applied", taskId: result.taskId, duplicate: result.duplicate, message: "확인 내용을 반영했어." };
  }

  async processDiscoveredWorkItem(userId: UserId, item: DiscoveredWorkItem): Promise<WorkDiscoveryResult> {
    const dedupeKey = `${item.source}:${item.sourceItemId}`;
    const contentHash = createHash("sha256").update(JSON.stringify({ title: item.title, deadline: item.officialDeadline?.toISOString() ?? null, context: item.workContextHint, objective: item.objectiveHint, status: item.status, semantics: item.taskSemantics })).digest("hex");
    const inbox = await this.repositories.createOrGetDiscoveredInbox({ userId, item, dedupeKey, correlationId: this.ids.generateCorrelationId(), contentHash });
    const existing = await this.repositories.getExistingInputResult(userId, inbox.item.id);
    if (existing.command?.status === "applied" && existing.command.resultEntityId && existing.parsedEntity) {
      await this.repositories.upsertExternalReference({ userId, item, internalEntityType: "task", internalEntityId: existing.command.resultEntityId, contentHash });
      return { status: "materialized", inboxItemId: inbox.item.id, parsedEntityId: existing.parsedEntity.id, taskId: existing.command.resultEntityId as TaskId, duplicate: true };
    }
    const draft: ParsedTaskDraft = { title: item.title, ...(item.officialDeadline && { officialDeadline: item.officialDeadline.toISOString() }), ...(item.workContextHint && { workContextHint: item.workContextHint }), ...(item.objectiveHint && { objectiveHint: item.objectiveHint }), inferredFields: [] };
    const provenance = Object.fromEntries(Object.keys(draft).filter((key) => key !== "inferredFields").map((key) => [key, "external"])) as Record<string, Provenance>;
    const resolution = await this.resolve(userId, draft);
    const questions = this.questionsForResolution(resolution);
    const needsConfirmation = item.taskSemantics !== "clear" || item.status === "unknown" || resolution.ambiguous || resolution.workContextId === null;
    const parsedEntity = existing.parsedEntity ?? await this.repositories.createTaskEntity({ userId, inboxItemId: inbox.item.id, draft, provenance, confidence: needsConfirmation ? 0.5 : 1, resolution, requiresConfirmation: needsConfirmation, clarificationQuestions: questions.length ? questions : ["이 항목을 할 일로 만들까요?"], status: "validated" });
    await this.repositories.upsertExternalReference({ userId, item, internalEntityType: "parsed_entity", internalEntityId: parsedEntity.id, contentHash });
    if (item.status === "completed" || item.status === "deleted") {
      await this.repositories.setParsedEntityStatus(userId, parsedEntity.id, "rejected");
      await this.repositories.setInboxStatus(userId, inbox.item.id, "applied");
      return { status: "dismissed", inboxItemId: inbox.item.id, parsedEntityId: parsedEntity.id, duplicate: !inbox.created };
    }
    if (needsConfirmation) {
      await this.repositories.updateTaskEntity({ userId, entityId: parsedEntity.id, draft, provenance, resolution, requiresConfirmation: true, clarificationQuestions: questions.length ? questions : ["이 항목을 할 일로 만들까요?"] });
      await this.repositories.setInboxStatus(userId, inbox.item.id, "waiting_for_confirmation");
      return { status: "needs_confirmation", inboxItemId: inbox.item.id, parsedEntityId: parsedEntity.id, duplicate: !inbox.created };
    }
    const result = await this.materialize({ userId, inboxItemId: inbox.item.id, parsedEntityId: parsedEntity.id, draft, provenance, resolution, commandKey: `${dedupeKey}:CREATE_TASK:0`, correlationId: inbox.item.correlationId, source: item.source, external: { item, contentHash } });
    return { status: "materialized", inboxItemId: inbox.item.id, parsedEntityId: parsedEntity.id, taskId: result.taskId, duplicate: result.duplicate };
  }

  private async processValidatedText(input: TextInput): Promise<InputProcessingResult> {
    const prefix = `${input.source}:`;
    const dedupeKey = input.clientRequestId.startsWith(prefix) ? input.clientRequestId : `${prefix}${input.clientRequestId}`;
    const inbox = await this.repositories.createOrGetTextInbox({ userId: input.userId, text: input.text, source: input.source, receivedAt: new Date(input.receivedAt), dedupeKey, correlationId: this.ids.generateCorrelationId() });
    if (!inbox.created) return this.existingResult(await this.repositories.getExistingInputResult(input.userId, inbox.item.id));
    const timeZone = await this.repositories.getUserTimeZone(input.userId);
    if (!timeZone) { await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed"); throw new DomainError("CROSS_USER_ACCESS", "User profile was not found"); }
    let raw: unknown;
    try { raw = await this.interpreter.parseInput({ text: input.text, userId: input.userId, receivedAt: input.receivedAt, timeZone, source: input.source }); }
    catch (error) {
      await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed");
      if (error instanceof ZodError) throw new DomainError("PARSE_INVALID", "Interpreter output failed schema validation", { issues: error.issues });
      if (error instanceof DomainError) throw error;
      throw new DomainError("PARSE_FAILED", "Interpreter failed to parse input", { cause: error instanceof Error ? error.message : String(error) });
    }
    const validated = parseResultSchema.safeParse(raw);
    if (!validated.success) { await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed"); throw new DomainError("PARSE_INVALID", "Interpreter output failed schema validation", { issues: validated.error.issues }); }
    if (validated.data.intent !== "CREATE_TASK") { await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed"); throw new DomainError("UNSUPPORTED_INTENT", `Intent ${validated.data.intent} is not supported in v0.1`); }
    const entity = validated.data.entities.find((value) => value.entityType === "task_candidate");
    const draftResult = parsedTaskDraftSchema.safeParse(entity?.data);
    if (!entity || !draftResult.success) { await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed"); throw new DomainError("PARSE_INVALID", "CREATE_TASK requires one valid task_candidate", { ...(!draftResult.success && { issues: draftResult.error.issues }) }); }
    const provenanceError = this.getProvenanceError(draftResult.data, entity.provenance);
    if (provenanceError) { await this.repositories.setInboxStatus(input.userId, inbox.item.id, "failed"); throw new DomainError("PARSE_INVALID", provenanceError); }
    const normalized = applyExplicitTaskFacts(draftResult.data, entity.provenance, extractExplicitTaskFacts(input.text, new Date(input.receivedAt), timeZone));
    const resolution = await this.resolve(input.userId, normalized.draft);
    const questions = [...validated.data.clarificationQuestions, ...this.questionsForResolution(resolution)];
    const requiresConfirmation = validated.data.requiresConfirmation || resolution.ambiguous;
    const parsed = await this.repositories.createTaskEntity({ userId: input.userId, inboxItemId: inbox.item.id, draft: normalized.draft, provenance: normalized.provenance, confidence: entity.confidence, resolution, requiresConfirmation, clarificationQuestions: questions, status: "validated" });
    await this.repositories.setInboxStatus(input.userId, inbox.item.id, requiresConfirmation ? "waiting_for_confirmation" : "parsed");
    if (requiresConfirmation) return { status: "waiting_for_confirmation", inboxItemId: inbox.item.id, parsedEntityId: parsed.id, questions, duplicate: false };
    return this.materialize({ userId: input.userId, inboxItemId: inbox.item.id, parsedEntityId: parsed.id, draft: normalized.draft, provenance: normalized.provenance, resolution, commandKey: `${dedupeKey}:CREATE_TASK:0`, correlationId: inbox.item.correlationId, source: input.source });
  }

  private async materialize(input: { userId: UserId; inboxItemId: string; parsedEntityId: string; draft: ParsedTaskDraft; provenance: Record<string, Provenance>; resolution: TaskContextResolution; commandKey: string; correlationId: CorrelationId; source: string; external?: { item: DiscoveredWorkItem; contentHash: string } }): Promise<Extract<InputProcessingResult, { status: "applied" }>> {
    const draft = { ...input.draft, estimatedMinutes: input.draft.estimatedMinutes ?? 30, importance: input.draft.importance ?? 3, executionMode: input.draft.executionMode ?? "standard" } satisfies ParsedTaskDraft;
    const command = await this.repositories.createOrGetCreateTaskCommand({ userId: input.userId, draft, provenance: this.withDefaultProvenance(input.draft, input.provenance), resolution: input.resolution, idempotencyKey: input.commandKey, correlationId: input.correlationId });
    await this.repositories.linkCommand(input.userId, input.parsedEntityId, command.command.id);
    const eventKey = `domain-command:${command.command.id}`;
    const existingTask = command.command.resultEntityId as TaskId | null ?? await this.repositories.findTaskIdByEventIdempotencyKey(input.userId, eventKey);
    if (existingTask) {
      await this.markApplied(input.userId, input.inboxItemId, input.parsedEntityId, command.command.id, existingTask);
      await this.repositories.promoteExternalReferences(input.userId, input.parsedEntityId, existingTask);
      if (input.external) await this.repositories.upsertExternalReference({ userId: input.userId, item: input.external.item, internalEntityType: "task", internalEntityId: existingTask, contentHash: input.external.contentHash });
      return { status: "applied", inboxItemId: input.inboxItemId, parsedEntityId: input.parsedEntityId, commandId: command.command.id, taskId: existingTask, duplicate: !command.created };
    }
    try {
      const task = await this.taskService.createTask({ userId: input.userId, workContextId: input.resolution.workContextId, objectiveId: input.resolution.objectiveId, title: draft.title, description: draft.description, executionMode: draft.executionMode!, officialDeadline: draft.officialDeadline ? new Date(draft.officialDeadline) : undefined, estimatedMinutes: draft.estimatedMinutes, importance: draft.importance!, source: input.source, correlationId: input.correlationId, idempotencyKey: eventKey });
      await this.markApplied(input.userId, input.inboxItemId, input.parsedEntityId, command.command.id, task.id);
      await this.repositories.promoteExternalReferences(input.userId, input.parsedEntityId, task.id);
      if (input.external) await this.repositories.upsertExternalReference({ userId: input.userId, item: input.external.item, internalEntityType: "task", internalEntityId: task.id, contentHash: input.external.contentHash });
      return { status: "applied", inboxItemId: input.inboxItemId, parsedEntityId: input.parsedEntityId, commandId: command.command.id, taskId: task.id, duplicate: false };
    } catch (error) {
      const recovered = await this.repositories.findTaskIdByEventIdempotencyKey(input.userId, eventKey);
      if (recovered) { await this.markApplied(input.userId, input.inboxItemId, input.parsedEntityId, command.command.id, recovered); await this.repositories.promoteExternalReferences(input.userId, input.parsedEntityId, recovered); return { status: "applied", inboxItemId: input.inboxItemId, parsedEntityId: input.parsedEntityId, commandId: command.command.id, taskId: recovered, duplicate: true }; }
      await this.repositories.markCommandFailed(input.userId, command.command.id); await this.repositories.setInboxStatus(input.userId, input.inboxItemId, "failed"); throw error;
    }
  }

  private async applyConfirmationCorrection(userId: UserId, candidate: PendingTaskConfirmation, text: string, receivedAt: Date) {
    let draft = candidate.draft; let provenance = candidate.provenance; let recognized = /^(맞아|응|네|확인|추가해|만들어줘)[.!]?$/u.test(text);
    const timeZone = await this.repositories.getUserTimeZone(userId);
    if (!timeZone) throw new DomainError("CROSS_USER_ACCESS", "User profile was not found");
    const facts = extractExplicitTaskFacts(text, receivedAt, timeZone);
    if (Object.keys(facts).length) { const corrected = applyExplicitTaskFacts(draft, provenance, facts); draft = corrected.draft; provenance = corrected.provenance; recognized = true; }
    const context = text.match(/^(?:이건\s+)?(.+?)\s*(?:프로젝트|수업|과목)(?:\s*일|\s*작업)?(?:이야|입니다)?[.!]?$/u);
    const objective = text.match(/^(?:목표는|이건\s+목표)\s+(.+?)(?:이야|입니다)?[.!]?$/u);
    const title = text.match(/^(?:제목은|할 일은)\s+(.+?)(?:이야|입니다)?[.!]?$/u);
    if (context?.[1]) { draft = { ...draft, workContextHint: context[1].trim() }; provenance = { ...provenance, workContextHint: "user_explicit" }; recognized = true; }
    if (objective?.[1]) { draft = { ...draft, objectiveHint: objective[1].trim() }; provenance = { ...provenance, objectiveHint: "user_explicit" }; recognized = true; }
    if (title?.[1]) { draft = { ...draft, title: title[1].trim() }; provenance = { ...provenance, title: "user_explicit" }; recognized = true; }
    return recognized ? { draft, provenance, resolution: await this.resolve(userId, draft) } : null;
  }

  private async resolve(userId: UserId, draft: ParsedTaskDraft): Promise<TaskContextResolution> {
    if (!draft.workContextHint && !draft.objectiveHint) return EMPTY_RESOLUTION;
    const values = await this.repositories.getContextCandidates(userId);
    return resolveTaskContext(draft, values.workContexts, values.objectives);
  }
  private questionsForResolution(value: TaskContextResolution): string[] {
    if (!value.ambiguous) return [];
    if (value.ambiguity === "objective") return ["같은 이름의 목표가 여러 개야. 프로젝트명과 목표명을 함께 알려줘."];
    if (value.ambiguity === "conflict") return ["프로젝트와 목표가 서로 달라. 연결할 프로젝트와 목표를 다시 알려줘."];
    return ["같거나 비슷한 프로젝트가 여러 개야. 정확한 프로젝트명을 알려줘."];
  }
  private async dismissCandidate(userId: UserId, value: PendingTaskConfirmation): Promise<void> { await this.repositories.setParsedEntityStatus(userId, value.parsedEntityId, "rejected"); await this.repositories.setInboxStatus(userId, value.inboxItem.id, "applied"); }
  private existingResult(existing: ExistingInputResult): InputProcessingResult {
    if (existing.command?.status === "applied" && existing.command.resultEntityId && existing.parsedEntity) return { status: "applied", inboxItemId: existing.inboxItem.id, parsedEntityId: existing.parsedEntity.id, commandId: existing.command.id, taskId: existing.command.resultEntityId as TaskId, duplicate: true };
    if (existing.inboxItem.parseStatus === "waiting_for_confirmation" && existing.parsedEntity) return { status: "waiting_for_confirmation", inboxItemId: existing.inboxItem.id, parsedEntityId: existing.parsedEntity.id, questions: [], duplicate: true };
    if (existing.inboxItem.parseStatus === "failed") return { status: "failed", inboxItemId: existing.inboxItem.id, duplicate: true };
    return { status: "pending", inboxItemId: existing.inboxItem.id, duplicate: true };
  }
  private getProvenanceError(draft: ParsedTaskDraft, provenance: Record<string, Provenance>): string | null {
    const fields = Object.entries(draft).filter(([field, value]) => field !== "inferredFields" && value !== undefined).map(([field]) => field);
    const missing = fields.find((field) => provenance[field] === undefined); if (missing) return `Field ${missing} lacks provenance`;
    const invalid = draft.inferredFields.find((field) => provenance[field] !== "ai_inferred"); if (invalid) return `Inferred field ${invalid} lacks ai_inferred provenance`;
    const unmarked = fields.find((field) => provenance[field] === "ai_inferred" && !draft.inferredFields.includes(field)); return unmarked ? `AI inferred field ${unmarked} is absent from inferredFields` : null;
  }
  private withDefaultProvenance(draft: ParsedTaskDraft, provenance: Record<string, Provenance>): Record<string, Provenance> { return { ...provenance, estimatedMinutes: provenance.estimatedMinutes ?? (draft.estimatedMinutes === undefined ? "system_derived" : "ai_inferred"), importance: provenance.importance ?? (draft.importance === undefined ? "system_derived" : "ai_inferred"), executionMode: provenance.executionMode ?? (draft.executionMode === undefined ? "system_derived" : "ai_inferred") }; }
  private async markApplied(userId: UserId, inboxId: string, entityId: string, commandId: string, taskId: TaskId): Promise<void> { await this.repositories.markCommandApplied(userId, commandId, taskId); await this.repositories.setParsedEntityStatus(userId, entityId, "applied"); await this.repositories.setInboxStatus(userId, inboxId, "applied"); }
}
