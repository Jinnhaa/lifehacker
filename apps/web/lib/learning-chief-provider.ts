import "server-only";

import { loadLearningWorkspace, type LearningWorkspaceDependencies } from "./learning-workspace-server";

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

export async function loadLearningSpecialistSummary(
  dependencies?: LearningWorkspaceDependencies
): Promise<LearningSpecialistSummary> {
  const workspace = await loadLearningWorkspace(dependencies);
  const contexts = [...workspace.courses, ...workspace.certifications];
  const active = contexts.flatMap((context) => context.actions.flatMap((action) => action.kind === "task"
    ? [{ title: action.title, contextTitle: context.title, taskId: action.taskId, status: "active_task" as const }] : []))[0];
  return {
    nearestEvent: workspace.nearest,
    riskCount: workspace.riskTitles.length,
    attentionNeededCount: contexts.filter((context) => context.state === "risk" || context.state === "attention").length,
    needsReviewCount: workspace.unknownTitles.length,
    activeTaskIds: contexts.flatMap((context) => context.actions.flatMap((action) => action.kind === "task" && action.taskId ? [action.taskId] : [])),
    currentRecommendation: active ?? null
  };
}
