import type { TaskId, UserId } from "@amber/shared";
import type { CreateTaskRecord, Task, TaskStatus, UpdateTaskRecord } from "./task.js";
import type { TaskDomainEventInput } from "./task-event.js";
export type TransitionTaskResult = {
    readonly kind: "updated";
    readonly task: Task;
} | {
    readonly kind: "not_found";
} | {
    readonly kind: "stale";
    readonly currentStatus: TaskStatus;
};
export interface TaskRepository {
    getTaskById(userId: UserId, taskId: TaskId): Promise<Task | null>;
    listActiveTasks(userId: UserId): Promise<readonly Task[]>;
    createTask(input: CreateTaskRecord, event: Omit<TaskDomainEventInput, "aggregateId">): Promise<Task>;
    updateTask(userId: UserId, taskId: TaskId, patch: UpdateTaskRecord): Promise<Task | null>;
    transitionTask(userId: UserId, taskId: TaskId, expectedStatus: TaskStatus, nextStatus: TaskStatus, completedAt: Date | null, event: TaskDomainEventInput): Promise<TransitionTaskResult>;
    appendDomainEvent(event: TaskDomainEventInput & {
        readonly aggregateId: TaskId;
    }): Promise<void>;
}
//# sourceMappingURL=task-repository.d.ts.map