export type WorkActionState = { readonly status: "idle" | "success" | "error"; readonly message: string };
export type WorkView = "today" | "week" | "month";

export type WorkContextOption = { readonly id: string; readonly title: string; readonly kind: "project" | "course" };

export type WorkWin = {
  readonly id: string; readonly title: string; readonly level: "MONTHLY" | "WEEKLY";
  readonly progress: number; readonly remainingMinutes: number;
};

export type WorkTaskItem = {
  readonly id: string; readonly title: string; readonly status: string;
  readonly plannedDate: string; readonly plannedDateSource: "user" | "plan" | "chief";
  readonly officialDeadline: string | null; readonly internalDeadline: string | null;
  readonly internalDeadlineInput: string;
  readonly officialDeadlineLabel: string | null; readonly internalDeadlineLabel: string | null;
  readonly estimatedMinutes: number | null; readonly workContextId: string | null;
  readonly contextTitle: string | null; readonly contextKind: "project" | "course" | null;
  readonly goalId: string | null; readonly goalTitle: string | null;
  readonly goalLevel: "LONG_TERM" | "MONTHLY" | "WEEKLY" | null;
  readonly priorityBand: "P0" | "P1" | "P2" | "P3" | "P4" | null;
};

export type WorkCalendarEvent = {
  readonly id: string; readonly title: string; readonly date: string;
  readonly startsAt: string; readonly endsAt: string; readonly timeLabel: string; readonly major: boolean;
};

export type WorkTodayQuest =
  | { readonly id: string; readonly kind: "task"; readonly task: WorkTaskItem; readonly title: string; readonly estimatedMinutes: number | null; readonly contextTitle: string | null; readonly priorityBand: WorkTaskItem["priorityBand"] }
  | { readonly id: string; readonly kind: "course_study"; readonly task: null; readonly title: string; readonly estimatedMinutes: number; readonly contextTitle: string | null; readonly priorityBand: WorkTaskItem["priorityBand"] };

export type WorkDay = {
  readonly date: string; readonly dayLabel: string; readonly dateLabel: string; readonly isToday: boolean;
  readonly tasks: readonly WorkTaskItem[]; readonly events: readonly WorkCalendarEvent[];
};

export type WorkMonthDay = {
  readonly date: string; readonly dayNumber: number; readonly inMonth: boolean; readonly isToday: boolean;
  readonly highlights: readonly { readonly id: string; readonly title: string; readonly kind: "official" | "internal" | "assessment" | "milestone" | "event" }[];
};

export type WorkCandidateItem = {
  readonly id: string; readonly title: string; readonly sourceLabel: string; readonly estimatedMinutes: number | null;
  readonly workContextId: string | null; readonly contextTitle: string | null;
};

export type WorkBoardViewModel = {
  readonly configured: boolean; readonly error: string | null; readonly timeZone: string; readonly today: string;
  readonly monthLabel: string; readonly weeklyWins: readonly WorkWin[]; readonly monthlyWins: readonly WorkWin[];
  readonly week: readonly WorkDay[]; readonly todayTasks: readonly WorkTaskItem[]; readonly todayQuests: readonly WorkTodayQuest[]; readonly todayEvents: readonly WorkCalendarEvent[];
  readonly todayCapacityMinutes: number | null; readonly todayWorkloadMinutes: number; readonly deadlineWarning: string | null;
  readonly month: readonly WorkMonthDay[]; readonly unplannedTasks: readonly WorkTaskItem[];
  readonly candidates: readonly WorkCandidateItem[]; readonly contexts: readonly WorkContextOption[];
};
