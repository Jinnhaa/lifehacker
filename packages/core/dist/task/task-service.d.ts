import { type Clock, type IdGenerator, type TaskId } from "@amber/shared";
import { z } from "zod";
import type { Task } from "./task.js";
import type { TaskRepository } from "./task-repository.js";
declare const createTaskSchema: z.ZodObject<{
    userId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").UserId, string>>;
    workContextId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
    objectiveId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    executionMode: z.ZodDefault<z.ZodEnum<{
        standard: "standard";
        learning_required: "learning_required";
        output_focused: "output_focused";
        mixed: "mixed";
    }>>;
    officialDeadline: z.ZodOptional<z.ZodUnion<readonly [z.ZodDate, z.ZodNull]>>;
    internalDeadline: z.ZodOptional<z.ZodUnion<readonly [z.ZodDate, z.ZodNull]>>;
    plannedDate: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    estimatedMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    estimatedUserMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    importance: z.ZodNumber;
    nextAction: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    completionCriteria: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    source: z.ZodString;
    correlationId: z.ZodOptional<z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").CorrelationId, string>>>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateTaskInput = z.input<typeof createTaskSchema>;
declare const updateTaskSchema: z.ZodObject<{
    userId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").UserId, string>>;
    taskId: z.ZodPipe<z.ZodUUID, z.ZodTransform<TaskId, string>>;
    workContextId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
    objectiveId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>;
    title: z.ZodOptional<z.ZodString>;
    internalDeadline: z.ZodOptional<z.ZodUnion<readonly [z.ZodDate, z.ZodNull]>>;
    plannedDate: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    estimatedMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    source: z.ZodDefault<z.ZodString>;
    correlationId: z.ZodOptional<z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").CorrelationId, string>>>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
declare const updateOfficialDeadlineFromExternalSchema: z.ZodObject<{
    userId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").UserId, string>>;
    taskId: z.ZodPipe<z.ZodUUID, z.ZodTransform<TaskId, string>>;
    officialDeadline: z.ZodUnion<readonly [z.ZodDate, z.ZodNull]>;
    source: z.ZodString;
    correlationId: z.ZodOptional<z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").CorrelationId, string>>>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type UpdateOfficialDeadlineFromExternalInput = z.input<typeof updateOfficialDeadlineFromExternalSchema>;
declare const completeTaskFromExternalSchema: z.ZodObject<{
    userId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").UserId, string>>;
    taskId: z.ZodPipe<z.ZodUUID, z.ZodTransform<TaskId, string>>;
    source: z.ZodString;
    idempotencyKey: z.ZodString;
    correlationId: z.ZodOptional<z.ZodPipe<z.ZodUUID, z.ZodTransform<import("@amber/shared").CorrelationId, string>>>;
}, z.core.$strict>;
export type CompleteTaskFromExternalInput = z.input<typeof completeTaskFromExternalSchema>;
export interface TransitionOptions {
    readonly userId: string;
    readonly taskId: string;
    readonly reason?: string;
    readonly source?: string;
    readonly correlationId?: string;
}
export declare class TaskService {
    private readonly repository;
    private readonly clock;
    private readonly ids;
    constructor(repository: TaskRepository, clock: Clock, ids?: IdGenerator);
    createTask(input: CreateTaskInput): Promise<Task>;
    updateTask(input: UpdateTaskInput): Promise<Task>;
    updateOfficialDeadlineFromExternal(input: UpdateOfficialDeadlineFromExternalInput): Promise<Task>;
    completeTaskFromExternal(input: CompleteTaskFromExternalInput): Promise<Task>;
    planTask(options: TransitionOptions): Promise<Task>;
    startTask(options: TransitionOptions): Promise<Task>;
    blockTask(options: TransitionOptions & {
        readonly reason: string;
    }): Promise<Task>;
    waitForUser(options: TransitionOptions & {
        readonly reason: string;
    }): Promise<Task>;
    resumeTask(options: TransitionOptions): Promise<Task>;
    completeTask(options: TransitionOptions): Promise<Task>;
    private transition;
    private parse;
    private notFound;
}
export {};
//# sourceMappingURL=task-service.d.ts.map