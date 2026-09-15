import {
  DomainError,
  SystemIdGenerator,
  correlationIdSchema,
  taskIdSchema,
  userIdSchema,
  type Clock,
  type IdGenerator,
  type TaskId
} from "@amber/shared";
import { z } from "zod";
import type { CreateTaskRecord, Task, TaskStatus } from "./task.js";
import { taskExecutionModes } from "./task.js";
import { getTaskEventType, type TaskDomainEventInput } from "./task-event.js";
import type { TaskRepository } from "./task-repository.js";
import { assertTaskTransition } from "./task-state-machine.js";

const nullableDate = z.union([z.date(), z.null()]).optional();
const createTaskSchema = z.object({
  userId: userIdSchema,
  workContextId: z.uuid().nullable().optional(),
  objectiveId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  executionMode: z.enum(taskExecutionModes).default("standard"),
  officialDeadline: nullableDate,
  internalDeadline: nullableDate,
  estimatedMinutes: z.number().int().nonnegative().nullable().optional(),
  estimatedUserMinutes: z.number().int().nonnegative().nullable().optional(),
  importance: z.number().int().min(1).max(5),
  nextAction: z.string().trim().nullable().optional(),
  completionCriteria: z.string().trim().nullable().optional(),
  source: z.string().trim().min(1),
  correlationId: correlationIdSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(500).optional()
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;

const updateTaskSchema = z.object({
  userId: userIdSchema,
  taskId: taskIdSchema,
  workContextId: z.uuid().nullable().optional(),
  objectiveId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).optional(),
  internalDeadline: nullableDate,
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  source: z.string().trim().min(1).default("user"),
  correlationId: correlationIdSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(500).optional()
}).strict();

export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

const updateOfficialDeadlineFromExternalSchema = z.object({
  userId: userIdSchema,
  taskId: taskIdSchema,
  officialDeadline: z.union([z.date(), z.null()]),
  source: z.string().trim().min(1),
  correlationId: correlationIdSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(500).optional()
}).strict();

export type UpdateOfficialDeadlineFromExternalInput = z.input<typeof updateOfficialDeadlineFromExternalSchema>;

const completeTaskFromExternalSchema = z.object({
  userId: userIdSchema,
  taskId: taskIdSchema,
  source: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(500),
  correlationId: correlationIdSchema.optional()
}).strict();

export type CompleteTaskFromExternalInput = z.input<typeof completeTaskFromExternalSchema>;

export interface TransitionOptions {
  readonly userId: string;
  readonly taskId: string;
  readonly reason?: string;
  readonly source?: string;
  readonly correlationId?: string;
}

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator = new SystemIdGenerator()
  ) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    const parsed = this.parse(createTaskSchema, input);
    const changedAt = this.clock.now();
    const correlationId = parsed.correlationId ?? this.ids.generateCorrelationId();
    const record: CreateTaskRecord = {
      userId: parsed.userId,
      title: parsed.title,
      executionMode: parsed.executionMode,
      importance: parsed.importance,
      ...(parsed.workContextId !== undefined && { workContextId: parsed.workContextId }),
      ...(parsed.objectiveId !== undefined && { objectiveId: parsed.objectiveId }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.officialDeadline !== undefined && { officialDeadline: parsed.officialDeadline }),
      ...(parsed.internalDeadline !== undefined && { internalDeadline: parsed.internalDeadline }),
      ...(parsed.estimatedMinutes !== undefined && { estimatedMinutes: parsed.estimatedMinutes }),
      ...(parsed.estimatedUserMinutes !== undefined && { estimatedUserMinutes: parsed.estimatedUserMinutes }),
      ...(parsed.nextAction !== undefined && { nextAction: parsed.nextAction }),
      ...(parsed.completionCriteria !== undefined && { completionCriteria: parsed.completionCriteria })
    };
    return this.repository.createTask(record, {
      userId: parsed.userId,
      eventType: "task_created",
      actorType: parsed.source,
      occurredAt: changedAt,
      correlationId,
      ...(parsed.idempotencyKey && { idempotencyKey: parsed.idempotencyKey }),
      payload: {
        previous_status: null,
        next_status: "INBOX",
        source: parsed.source,
        changed_at: changedAt.toISOString()
      }
    });
  }

  async updateTask(input: UpdateTaskInput): Promise<Task> {
    const parsed = this.parse(updateTaskSchema, input);
    const current = await this.repository.getTaskById(parsed.userId, parsed.taskId);
    if (!current) throw this.notFound(parsed.taskId);
    if (parsed.objectiveId !== undefined && parsed.objectiveId !== current.objectiveId) {
      throw new DomainError("INVALID_INPUT", "Objective cannot be reassigned through Task correction");
    }
    const changedAt = this.clock.now();
    const changes: Record<string, { previous: string | number | null; next: string | number | null }> = {};
    if (parsed.workContextId !== undefined) {
      changes.work_context_id = { previous: current.workContextId, next: parsed.workContextId };
    }
    if (parsed.title !== undefined) changes.title = { previous: current.title, next: parsed.title };
    if (parsed.internalDeadline !== undefined) {
      changes.internal_deadline = {
        previous: current.internalDeadline?.toISOString() ?? null,
        next: parsed.internalDeadline?.toISOString() ?? null
      };
    }
    if (parsed.estimatedMinutes !== undefined) {
      changes.estimated_minutes = { previous: current.estimatedMinutes, next: parsed.estimatedMinutes };
    }
    const updated = await this.repository.updateTask(parsed.userId, parsed.taskId, {
      ...(parsed.workContextId !== undefined && {
        workContextId: parsed.workContextId,
        ...(parsed.workContextId !== current.workContextId && { objectiveId: null })
      }),
      ...(parsed.title !== undefined && { title: parsed.title }),
      ...(parsed.internalDeadline !== undefined && { internalDeadline: parsed.internalDeadline }),
      ...(parsed.estimatedMinutes !== undefined && { estimatedMinutes: parsed.estimatedMinutes })
    }, {
      userId: parsed.userId,
      eventType: "task_updated",
      actorType: parsed.source,
      occurredAt: changedAt,
      correlationId: parsed.correlationId ?? this.ids.generateCorrelationId(),
      ...(parsed.idempotencyKey && { idempotencyKey: parsed.idempotencyKey }),
      payload: {
        previous_status: current.status,
        next_status: current.status,
        source: parsed.source,
        changed_at: changedAt.toISOString(),
        changes
      }
    });
    if (!updated) throw this.notFound(parsed.taskId);
    return updated;
  }

  async updateOfficialDeadlineFromExternal(input: UpdateOfficialDeadlineFromExternalInput): Promise<Task> {
    const parsed = this.parse(updateOfficialDeadlineFromExternalSchema, input);
    const current = await this.repository.getTaskById(parsed.userId, parsed.taskId);
    if (!current) throw this.notFound(parsed.taskId);
    if (current.officialDeadline?.getTime() === parsed.officialDeadline?.getTime()
      || (current.officialDeadline === null && parsed.officialDeadline === null)) {
      return current;
    }
    const changedAt = this.clock.now();
    const updated = await this.repository.updateTask(parsed.userId, parsed.taskId, {
      officialDeadline: parsed.officialDeadline
    }, {
      userId: parsed.userId,
      eventType: "task_updated",
      actorType: parsed.source,
      occurredAt: changedAt,
      correlationId: parsed.correlationId ?? this.ids.generateCorrelationId(),
      ...(parsed.idempotencyKey && { idempotencyKey: parsed.idempotencyKey }),
      payload: {
        previous_status: current.status,
        next_status: current.status,
        source: parsed.source,
        changed_at: changedAt.toISOString(),
        changes: {
          official_deadline: {
            previous: current.officialDeadline?.toISOString() ?? null,
            next: parsed.officialDeadline?.toISOString() ?? null
          }
        }
      }
    });
    if (!updated) throw this.notFound(parsed.taskId);
    return updated;
  }

  async completeTaskFromExternal(input: CompleteTaskFromExternalInput): Promise<Task> {
    const parsed = this.parse(completeTaskFromExternalSchema, input);
    const current = await this.repository.getTaskById(parsed.userId, parsed.taskId);
    if (!current) throw this.notFound(parsed.taskId);
    if (current.status === "DONE") return current;
    const changedAt = this.clock.now();
    const result = await this.repository.transitionTask(
      parsed.userId,
      parsed.taskId,
      current.status,
      "DONE",
      changedAt,
      {
        userId: parsed.userId,
        aggregateId: parsed.taskId,
        eventType: "task_completed",
        actorType: parsed.source,
        occurredAt: changedAt,
        correlationId: parsed.correlationId ?? this.ids.generateCorrelationId(),
        idempotencyKey: parsed.idempotencyKey,
        payload: {
          previous_status: current.status,
          next_status: "DONE",
          reason: "authoritative_external_completion",
          source: parsed.source,
          changed_at: changedAt.toISOString()
        }
      }
    );
    if (result.kind === "updated") return result.task;
    if (result.kind === "not_found") throw this.notFound(parsed.taskId);
    if (result.currentStatus === "DONE") {
      const completed = await this.repository.getTaskById(parsed.userId, parsed.taskId);
      if (completed) return completed;
    }
    throw new DomainError("CONFLICT", "Task changed during external completion", {
      expectedStatus: current.status,
      currentStatus: result.currentStatus
    });
  }

  planTask(options: TransitionOptions): Promise<Task> {
    return this.transition(options, "PLANNED");
  }

  startTask(options: TransitionOptions): Promise<Task> {
    return this.transition(options, "IN_PROGRESS");
  }

  blockTask(options: TransitionOptions & { readonly reason: string }): Promise<Task> {
    return this.transition(options, "BLOCKED", true);
  }

  waitForUser(options: TransitionOptions & { readonly reason: string }): Promise<Task> {
    return this.transition(options, "WAITING_FOR_USER", true);
  }

  resumeTask(options: TransitionOptions): Promise<Task> {
    return this.transition(options, "IN_PROGRESS");
  }

  completeTask(options: TransitionOptions): Promise<Task> {
    return this.transition(options, "DONE");
  }

  private async transition(options: TransitionOptions, nextStatus: TaskStatus, reasonRequired = false): Promise<Task> {
    const userId = this.parse(userIdSchema, options.userId);
    const taskId = this.parse(taskIdSchema, options.taskId);
    const source = options.source?.trim() || "user";
    const reason = options.reason?.trim();
    if (reasonRequired && !reason) {
      throw new DomainError("INVALID_INPUT", "A reason is required for this transition");
    }
    const correlationId = options.correlationId
      ? this.parse(correlationIdSchema, options.correlationId)
      : this.ids.generateCorrelationId();
    const current = await this.repository.getTaskById(userId, taskId);
    if (!current) throw this.notFound(taskId);
    assertTaskTransition(current.status, nextStatus);

    const changedAt = this.clock.now();
    const event: TaskDomainEventInput = {
      userId,
      aggregateId: taskId,
      eventType: getTaskEventType(current.status, nextStatus),
      actorType: source,
      occurredAt: changedAt,
      correlationId,
      payload: {
        previous_status: current.status,
        next_status: nextStatus,
        ...(reason && { reason }),
        source,
        changed_at: changedAt.toISOString()
      }
    };
    const result = await this.repository.transitionTask(
      userId,
      taskId,
      current.status,
      nextStatus,
      nextStatus === "DONE" ? changedAt : null,
      event
    );
    if (result.kind === "updated") return result.task;
    if (result.kind === "not_found") throw this.notFound(taskId);
    throw new DomainError("CONFLICT", "Task changed during transition", {
      expectedStatus: current.status,
      currentStatus: result.currentStatus
    });
  }

  private parse<Output>(schema: z.ZodType<Output>, input: unknown): Output {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new DomainError("INVALID_INPUT", "Input validation failed", { issues: result.error.issues });
    }
    return result.data;
  }

  private notFound(taskId: TaskId): DomainError {
    return new DomainError("TASK_NOT_FOUND", "Task was not found", { taskId });
  }
}
