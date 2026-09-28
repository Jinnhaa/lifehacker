import "server-only";

import { provideChiefLearningCandidates, type ChiefLearningCandidate } from "@amber/core";
import { loadLearningWorkspace } from "./learning-workspace-server";

export interface LearningSpecialistSummary {
  readonly nearestEvent: { readonly contextTitle: string; readonly eventTitle: string; readonly dateLabel: string; readonly days: number } | null;
  readonly riskCount: number;
  readonly attentionNeededCount: number;
  readonly needsReviewCount: number;
  readonly activeTaskIds: readonly string[];
  readonly currentRecommendation: {
    readonly title: string;
    readonly contextTitle: string;
    readonly taskId: string | null;
    readonly status: "active_task" | "candidate";
  } | null;
}

export async function loadChiefLearningCandidates(): Promise<{
  readonly candidates: readonly ChiefLearningCandidate[];
  readonly specialist: LearningSpecialistSummary;
}> {
  const workspace = await loadLearningWorkspace();
  const contexts = [...workspace.courses, ...workspace.certifications];
  const candidates = provideChiefLearningCandidates(contexts.flatMap((context) => context.actions.map((action) => ({
    contextId: context.id,
    contextTitle: context.title,
    commitmentLevel: context.commitmentLevel as "REQUIRED" | "IMPORTANT" | "OPTIONAL" | null,
    strategicImportance: context.strategicImportance,
    studyMode: context.studyMode as "CUMULATIVE" | "MIXED" | "CRAMMABLE" | null,
    proposal: action.proposal,
    canonicalActiveTaskId: action.taskId,
    assessment: context.nextAssessment?.sortAt ? { title: context.nextAssessment.title, dueDate: context.nextAssessment.sortAt.slice(0, 10) } : null,
    forecast: context.forecast,
    judgmentState: context.state === "risk" ? "RISK" as const : context.state === "attention" ? "ATTENTION" as const
      : context.state === "unknown" ? "NEEDS_REVIEW" as const : "SAFE" as const,
    evidenceRefs: action.reasons.map((reason) => `learning-reason:${reason.code}`)
  }))));
  const active = contexts.flatMap((context) => context.actions.flatMap((action) => action.kind === "task"
    ? [{ title: action.title, contextTitle: context.title, taskId: action.taskId, status: "active_task" as const }] : []))[0];
  const proposal = candidates[0];
  return {
    candidates,
    specialist: {
      nearestEvent: workspace.nearest,
      riskCount: workspace.riskTitles.length,
      attentionNeededCount: contexts.filter((context) => context.state === "risk" || context.state === "attention").length,
      needsReviewCount: workspace.unknownTitles.length,
      activeTaskIds: contexts.flatMap((context) => context.actions.flatMap((action) => action.kind === "task" && action.taskId ? [action.taskId] : [])),
      currentRecommendation: active ?? (proposal
        ? { title: proposal.proposal.title, contextTitle: proposal.contextTitle, taskId: null, status: "candidate" }
        : null)
    }
  };
}
