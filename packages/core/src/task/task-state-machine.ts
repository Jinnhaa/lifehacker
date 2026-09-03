import { DomainError } from "@amber/shared";
import type { TaskStatus } from "./task.js";

export const allowedTaskTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  INBOX: ["PLANNED", "IN_PROGRESS"],
  PLANNED: ["IN_PROGRESS", "DONE"],
  IN_PROGRESS: ["BLOCKED", "WAITING_FOR_USER", "DONE"],
  BLOCKED: ["IN_PROGRESS", "WAITING_FOR_USER", "DONE"],
  WAITING_FOR_USER: ["IN_PROGRESS", "BLOCKED", "DONE"],
  DONE: []
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
