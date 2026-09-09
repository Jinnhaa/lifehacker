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

export type HomeViewModel = {
  readonly configured: boolean;
  readonly error: string | null;
  readonly date: string;
  readonly timeZone: string;
  readonly currentAction: null | {
    readonly title: string;
    readonly minutes: number | null;
    readonly context: string | null;
    readonly source: string;
  };
  readonly approvedPlan: null | { readonly id: string; readonly revisionNo: number };
  readonly timeline: readonly HomeTimelineItem[];
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
