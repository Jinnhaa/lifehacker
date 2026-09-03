import type { TaskId, UserId } from "@amber/shared";
import { type Sql } from "postgres";
import type { CreateTaskRecord, Task, TaskStatus, UpdateTaskRecord } from "./task.js";
import type { TaskDomainEventInput } from "./task-event.js";
import type { TaskRepository, TransitionTaskResult } from "./task-repository.js";
export declare class SupabaseTaskRepository implements TaskRepository {
    private readonly sql;
    constructor(sql: Sql);
    static connect(connectionString: string): SupabaseTaskRepository;
    close(): Promise<void>;
    getTaskById(userId: UserId, taskId: TaskId): Promise<Task | null>;
    listActiveTasks(userId: UserId): Promise<readonly Task[]>;
    createTask(input: CreateTaskRecord, event: Omit<TaskDomainEventInput, "aggregateId">): Promise<Task>;
    updateTask(userId: UserId, taskId: TaskId, patch: UpdateTaskRecord): Promise<Task | null>;
    transitionTask(userId: UserId, taskId: TaskId, expectedStatus: TaskStatus, nextStatus: TaskStatus, completedAt: Date | null, event: TaskDomainEventInput): Promise<TransitionTaskResult>;
    appendDomainEvent(event: TaskDomainEventInput & {
        readonly aggregateId: TaskId;
    }): Promise<void>;
}
//# sourceMappingURL=supabase-task-repository.d.ts.map