import type { CommitmentLevel } from "../context-management/context-management.js";
import type { TaskStatus } from "../task/task.js";

export type WorldContextType = "project" | "course" | "certification";

export interface WorldTask {
  readonly id: string;
  readonly title: string;
  readonly contextId: string | null;
  readonly contextType: WorldContextType | null;
  readonly contextTitle: string | null;
  readonly taskType: "user" | "project" | "learning";
  readonly status: TaskStatus;
  readonly importance: number;
  readonly deadline: Date | null;
  readonly deadlineSource: "internal" | "official" | null;
  readonly estimatedMinutes: number | null;
  readonly actualMinutes: number;
  readonly remainingMinutes: number | null;
  readonly plannedDate: string | null;
  readonly completionCriteria: string | null;
}

export interface WorldProjectContext {
  readonly id: string;
  readonly title: string;
  readonly commitmentLevel: CommitmentLevel | null;
  readonly strategicImportance: number | null;
  readonly activeTaskIds: readonly string[];
  readonly deadlines: readonly Date[];
  readonly remainingWorkloadMinutes: number;
  readonly unknownEffortTaskIds: readonly string[];
}

export interface WorldLearningContext {
  readonly id: string;
  readonly type: "course" | "certification";
  readonly title: string;
  readonly commitmentLevel: CommitmentLevel | null;
  readonly strategicImportance: number | null;
  readonly target: string | null;
  readonly targetDate: string | null;
  readonly activeTaskIds: readonly string[];
  readonly remainingWorkloadMinutes: number;
  readonly unknownEffortTaskIds: readonly string[];
}

export interface WorldExecutionItem {
  readonly taskId: string;
  readonly title: string;
  readonly occurredAt: Date;
  readonly actualMinutes: number;
}

export interface WorldCalendarEvent {
  readonly id: string;
  readonly title: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly origin: string;
}

export interface WorldDailyCapacity {
  readonly date: string;
  readonly availableMinutes: number;
  readonly blockedMinutes: number;
  readonly elapsedMinutes: number;
  readonly planningBufferMinutes: number;
}

export type WorldRisk =
  | { readonly type: "deadline_overdue"; readonly taskIds: readonly string[] }
  | {
      readonly type: "today_workload_exceeds_capacity";
      readonly taskIds: readonly string[];
      readonly workloadMinutes: number;
      readonly availableMinutes: number;
    };

export interface WorldFocusItem {
  readonly id: string;
  readonly title: string;
  readonly type: "weekly_goal" | "today_must_win";
}

export interface WorldModelSnapshot {
  readonly now: Date;
  readonly timeZone: string;
  readonly contexts: {
    readonly learning: readonly WorldLearningContext[];
    readonly projects: readonly WorldProjectContext[];
  };
  readonly tasks: readonly WorldTask[];
  readonly execution: {
    readonly completedToday: readonly WorldExecutionItem[];
    readonly partialToday: readonly WorldExecutionItem[];
    readonly skippedToday: readonly WorldExecutionItem[];
  };
  readonly constraints: {
    readonly calendarEvents: readonly WorldCalendarEvent[];
    readonly todayCapacity: Omit<WorldDailyCapacity, "date">;
    readonly futureCapacity: readonly WorldDailyCapacity[];
  };
  readonly risks: readonly WorldRisk[];
  readonly focus: {
    readonly week: readonly WorldFocusItem[];
    readonly todayMustWin: WorldFocusItem | null;
  };
}
