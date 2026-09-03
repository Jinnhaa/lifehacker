import type { TaskId, UserId } from "@amber/shared";

export const taskStatuses = [
  "INBOX",
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING_FOR_USER",
  "DONE"
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskExecutionModes = ["standard", "learning_required", "output_focused", "mixed"] as const;
export type TaskExecutionMode = (typeof taskExecutionModes)[number];

export interface Task {
  readonly id: TaskId;
  readonly userId: UserId;
  readonly workContextId: string | null;
  readonly objectiveId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly executionMode: TaskExecutionMode;
  readonly officialDeadline: Date | null;
  readonly internalDeadline: Date | null;
  readonly estimatedMinutes: number | null;
  readonly estimatedUserMinutes: number | null;
  readonly actualMinutes: number;
  readonly importance: number;
  readonly status: TaskStatus;
  readonly nextAction: string | null;
  readonly completionCriteria: string | null;
  readonly completionSource: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly updatedAt: Date;
}

export interface CreateTaskRecord {
  readonly userId: UserId;
  readonly workContextId?: string | null;
  readonly objectiveId?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly executionMode: TaskExecutionMode;
  readonly officialDeadline?: Date | null;
  readonly internalDeadline?: Date | null;
  readonly estimatedMinutes?: number | null;
  readonly estimatedUserMinutes?: number | null;
  readonly importance: number;
  readonly nextAction?: string | null;
  readonly completionCriteria?: string | null;
}

export interface UpdateTaskRecord {
  readonly title?: string;
  readonly description?: string | null;
  readonly officialDeadline?: Date | null;
  readonly internalDeadline?: Date | null;
  readonly estimatedMinutes?: number | null;
  readonly estimatedUserMinutes?: number | null;
  readonly importance?: number;
  readonly nextAction?: string | null;
  readonly completionCriteria?: string | null;
}
