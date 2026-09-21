export type WorkActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
};

export type WorkContextOption = {
  readonly id: string;
  readonly title: string;
  readonly kind: "project" | "course";
};

export type WorkCandidateItem = {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly sourceLabel: string;
  readonly deadlineValue: string;
  readonly deadlineLabel: string | null;
  readonly estimatedMinutes: number | null;
  readonly workContextId: string | null;
  readonly contextTitle: string | null;
};

export type WorkTaskItem = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly planningDeadlineValue: string;
  readonly officialDeadlineLabel: string | null;
  readonly officialDeadlineSourceLabel: string | null;
  readonly targetDeadlineValue: string;
  readonly targetDeadlineLabel: string | null;
  readonly deadlineWarning: boolean;
  readonly estimatedMinutes: number | null;
  readonly workContextId: string | null;
  readonly contextTitle: string | null;
  readonly source: string;
  readonly sourceLabel: string;
};

export type WorkBoardViewModel = {
  readonly configured: boolean;
  readonly error: string | null;
  readonly timeZone: string;
  readonly candidates: readonly WorkCandidateItem[];
  readonly groups: readonly {
    readonly key: "overdue" | "today" | "week" | "later";
    readonly label: string;
    readonly tasks: readonly WorkTaskItem[];
  }[];
  readonly contexts: readonly WorkContextOption[];
};
