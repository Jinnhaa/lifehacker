import type { LearningTaskProposal } from "@amber/core";

export type LearningWorkspaceState = "normal" | "attention" | "risk" | "unknown";

export interface LearningWorkspaceAssessment {
  readonly id: string;
  readonly title: string;
  readonly dueDate: string | null;
  readonly dueAt: string | null;
  readonly sortAt: string | null;
}

export interface UniversityCourseReality {
  readonly workContextId: string;
  readonly snowboardCourseId: string | null;
  readonly title: string;
  readonly term: string | null;
  readonly schoolProgress: {
    readonly completedLectureCount: number;
    readonly remainingLectureCount: number;
    readonly remainingLectureMinutes: number;
    readonly observedAt: string;
  } | null;
  readonly selfStudy: {
    readonly state: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
    readonly completedUnits: number;
    readonly totalUnits: number | null;
    readonly progressPercent: number | null;
  };
  readonly understanding: { readonly unknown: number; readonly weak: number; readonly ok: number; readonly strong: number };
  readonly validation: { readonly notTested: number; readonly failed: number; readonly passed: number };
  readonly gap: { readonly status: "caught_up" | "behind" | "unknown"; readonly unitsBehind: number | null };
  readonly nextAssessment: LearningWorkspaceAssessment | null;
  readonly nextLearningTask: { readonly taskId: string; readonly title: string } | null;
  readonly diagnostics: { readonly unlinked: boolean; readonly hiddenLegacyContextIds: readonly string[] };
}

export interface LearningWorkspaceStage {
  readonly id: string;
  readonly title: string;
  readonly position: number;
  readonly status: string;
  readonly completionMode: string;
}

export interface LearningWorkspaceMaterial {
  readonly id: string;
  readonly title: string;
  readonly stageId: string | null;
  readonly materialType: string;
  readonly unitType: string | null;
  readonly totalUnits: number | null;
  readonly startUnit: number | null;
  readonly state: string;
  readonly completedUnits: number;
  readonly totalScopedUnits: number | null;
  readonly progressPercent: number | null;
  readonly exposure: string;
  readonly understanding: string;
  readonly validation: string;
}

export interface LearningWorkspaceAction {
  readonly kind: "task" | "proposal";
  readonly taskId: string | null;
  readonly targetId: string | null;
  readonly materialId: string;
  readonly allocationPolicyId: string | null;
  readonly title: string;
  readonly assignedUnits: number;
  readonly startSequence: number | null;
  readonly endSequence: number | null;
  readonly policyName: string | null;
  readonly source: string;
  readonly reasons: readonly { readonly code: string; readonly evidence: Readonly<Record<string, string | number | boolean | null>> }[];
  readonly estimatedMinutes: number | null;
  readonly proposal: LearningTaskProposal | null;
}

export interface LearningWorkspacePolicy {
  readonly id: string;
  readonly name: string;
  readonly profileType: string;
  readonly recoveryMode: string;
  readonly priority: number;
  readonly items: readonly { readonly id: string; readonly materialId: string; readonly materialTitle: string; readonly targetUnits: number }[];
}

export interface LearningWorkspaceContext {
  readonly id: string;
  readonly kind: "course" | "certification";
  readonly universityReality: UniversityCourseReality | null;
  readonly title: string;
  readonly strategicImportance: number | null;
  readonly commitmentLevel: string | null;
  readonly term: string | null;
  readonly target: string | null;
  readonly instructor: string | null;
  readonly studyMode: string | null;
  readonly currentLevel: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly activeStage: LearningWorkspaceStage | null;
  readonly stages: readonly LearningWorkspaceStage[];
  readonly materials: readonly LearningWorkspaceMaterial[];
  readonly assessments: readonly LearningWorkspaceAssessment[];
  readonly nextAssessment: LearningWorkspaceAssessment | null;
  readonly actions: readonly LearningWorkspaceAction[];
  readonly policies: readonly LearningWorkspacePolicy[];
  readonly state: LearningWorkspaceState;
  readonly stateLabel: string;
  readonly statusLine: string;
  readonly forecastLabel: string;
  readonly forecastDetail: string;
  readonly forecast: {
    readonly status: "PROJECTED" | "ALREADY_COMPLETE" | "UNKNOWN" | "BEYOND_HORIZON";
    readonly projectedCompletionDate: string | null;
    readonly scheduleSlackDays: number | null;
  };
  readonly activity: readonly { readonly id: string; readonly label: string; readonly detail: string; readonly occurredAt: string }[];
}

export interface LearningWorkspaceModel {
  readonly configured: boolean;
  readonly error: string | null;
  readonly today: string;
  readonly nearest: { readonly contextTitle: string; readonly eventTitle: string; readonly dateLabel: string; readonly days: number } | null;
  readonly riskTitles: readonly string[];
  readonly unknownTitles: readonly string[];
  readonly courses: readonly LearningWorkspaceContext[];
  readonly universityCourses: readonly LearningWorkspaceContext[];
  readonly courseDiagnostics: readonly { readonly workContextId: string; readonly reason: "unlinked" | "displayed_under_linked_course" }[];
  readonly certifications: readonly LearningWorkspaceContext[];
}

export type LearningWorkspaceActionState = { readonly status: "idle" | "success" | "error"; readonly message: string };
