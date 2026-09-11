export type HomeTimelineItem = {
  readonly id: string;
  readonly kind: "task" | "routine" | "rest" | "buffer" | "calendar";
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly minutes: number;
  readonly status: string;
  readonly context: string | null;
  readonly current: boolean;
};

export type HomeProposalChange = {
  readonly key: string;
  readonly title: string;
  readonly change: "kept" | "moved" | "deferred" | "added";
  readonly before: string | null;
  readonly after: string | null;
};

export type HomeWeekDay = {
  readonly date: string;
  readonly items: readonly HomeTimelineItem[];
};

export type HomeViewModel = {
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
  };
  readonly approvedPlan: null | { readonly id: string; readonly revisionNo: number };
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
  readonly proposal: null | {
    readonly planId: string;
    readonly revisionNo: number;
    readonly summary: string;
    readonly reason: string;
    readonly changes: readonly HomeProposalChange[];
  };
};

export type ChiefActionState = { readonly status: "idle" | "success" | "error"; readonly message: string };
export type RuntimeActionState = ChiefActionState;
