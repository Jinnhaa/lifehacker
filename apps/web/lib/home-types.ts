export type HomeTimelineItem = {
  readonly id: string;
  readonly taskId?: string | null;
  readonly stepId?: string | null;
  readonly occurrenceId?: string | null;
  readonly kind: "task" | "routine" | "rest" | "buffer" | "calendar";
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly minutes: number;
  readonly status: string;
  readonly context: string | null;
  readonly current: boolean;
  readonly source: "fixed" | "chief" | "current" | "pending";
};

export type HomeProposalChange = {
  readonly key: string;
  readonly title: string;
  readonly change: "kept" | "moved" | "removed" | "added" | "duration_changed";
  readonly before: string | null;
  readonly after: string | null;
  readonly beforeMinutes: number | null;
  readonly afterMinutes: number | null;
};

export type HomePlanReview = {
  readonly planId: string;
  readonly revisionNo: number;
  readonly status: "approved" | "pending_approval";
  readonly approvalKind: "morning" | "replan" | null;
  readonly totalMinutes: number;
  readonly items: readonly {
    readonly id: string;
    readonly taskId: string | null;
    readonly stepId: string | null;
    readonly occurrenceId: string | null;
    readonly title: string;
    readonly context: string | null;
    readonly itemType: "task" | "study" | "routine" | "rest" | "buffer" | "calendar";
    readonly startsAt: string;
    readonly endsAt: string;
    readonly minutes: number;
    readonly current: boolean;
  }[];
};

export type HomeWeekDay = {
  readonly date: string;
  readonly items: readonly HomeTimelineItem[];
};

export type HomeViewModel = {
  readonly outcomePriority?: { readonly judgment: OutcomeJudgment; readonly decisionId: string } | null;
  readonly missionProgress: Readonly<Record<string, { readonly completed: number; readonly total: number }>>;
  readonly configured: boolean;
  readonly error: string | null;
  readonly date: string;
  readonly timeZone: string;
  readonly currentAction: null | {
    readonly kind: "task" | "routine" | "rest";
    readonly taskId: string | null;
    readonly title: string;
    readonly minutes: number | null;
    readonly context: string | null;
    readonly source: string;
    readonly reason: string | null;
  };
  readonly approvedPlan: null | { readonly id: string; readonly revisionNo: number };
  readonly availableMinutes: number | null;
  readonly planReview: HomePlanReview | null;
  readonly planState: {
    readonly status: "no_plan" | "pending_approval" | "approved";
    readonly revisionNo: number | null;
    readonly message: string | null;
  };
  readonly calendar: {
    readonly activeProviders: readonly string[];
    readonly lastSyncedAt: string | null;
    readonly fixedCommitmentCount: number;
  };
  readonly focus: null | {
    readonly step: "active" | "awaiting_block_reason" | "awaiting_missing_detail" | "awaiting_other_detail" | "recovery_ready" | "awaiting_switch_confirmation";
    readonly taskId: string;
    readonly category: string | null;
    readonly startedAt: string | null;
    readonly durationMinutes: number;
    readonly stepTitle: string | null;
  };
  readonly reviewArtifacts: readonly {
    readonly id: string;
    readonly workContextId: string;
    readonly projectTitle: string;
    readonly title: string;
    readonly summary: string;
    readonly body: string;
    readonly contentHash: string;
  }[];
  readonly timeline: readonly HomeTimelineItem[];
  readonly week: readonly HomeWeekDay[];
  readonly goals: readonly { readonly name: string; readonly status: string }[];
  readonly agents: readonly { readonly name: string; readonly status: string; readonly detail: string }[];
  readonly decisionCount: number;
  readonly projectRuntime: readonly ProjectRuntimeSummary[];
  readonly proposal: null | {
    readonly planId: string;
    readonly revisionNo: number;
    readonly summary: string;
    readonly reason: string;
    readonly changes: readonly HomeProposalChange[];
    readonly totalMinutesBefore: number;
    readonly totalMinutesAfter: number;
  };
};

export type ChiefActionState = { readonly status: "idle" | "success" | "error"; readonly message: string };
export type RuntimeActionState = ChiefActionState;
import type { OutcomeJudgment, ProjectRuntimeSummary } from "@amber/core";
