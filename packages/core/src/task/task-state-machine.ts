import { DomainError } from "@amber/shared";
import type { TaskStatus } from "./task.js";

export const allowedTaskTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  INBOX: ["PLANNED", "IN_PROGRESS", "SKIPPED", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "WAITING_FOR_USER", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "WAITING_FOR_USER", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "BLOCKED", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
  DONE: [],
  CLOSED_PARTIAL: [],
  SKIPPED: [],
  CANCELLED: []
};

export const canTransitionTask = (previous: TaskStatus, next: TaskStatus): boolean =>
  allowedTaskTransitions[previous].includes(next);

export const assertTaskTransition = (previous: TaskStatus, next: TaskStatus): void => {
  if (!canTransitionTask(previous, next)) {
    throw new DomainError("INVALID_TASK_TRANSITION", `Task cannot transition from ${previous} to ${next}`, {
      previousStatus: previous,
      nextStatus: next
    });
  }
};
