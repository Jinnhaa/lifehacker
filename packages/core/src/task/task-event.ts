import type { CorrelationId, TaskId, UserId } from "@amber/shared";
import type { TaskStatus } from "./task.js";

export type TaskEventType =
  | "task_created"
  | "task_planned"
  | "task_started"
  | "task_blocked"
  | "task_waiting_for_user"
  | "task_resumed"
  | "task_completed";

export interface TaskEventPayload {
  readonly previous_status: TaskStatus | null;
  readonly next_status: TaskStatus;
  readonly reason?: string;
  readonly source: string;
  readonly changed_at: string;
}

export interface TaskDomainEventInput {
  readonly userId: UserId;
  readonly aggregateId?: TaskId;
  readonly eventType: TaskEventType;
  readonly actorType: string;
  readonly occurredAt: Date;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey?: string;
  readonly payload: TaskEventPayload;
}

export const getTaskEventType = (previous: TaskStatus, next: TaskStatus): TaskEventType => {
  if (next === "PLANNED") return "task_planned";
  if (next === "BLOCKED") return "task_blocked";
  if (next === "WAITING_FOR_USER") return "task_waiting_for_user";
  if (next === "DONE") return "task_completed";
  if (next === "IN_PROGRESS" && (previous === "BLOCKED" || previous === "WAITING_FOR_USER")) {
    return "task_resumed";
  }
  return "task_started";
};
