import type { LearningTaskProposal } from "./learning-task-execution.js";

export type LearningJudgmentState = "RISK" | "ATTENTION" | "SAFE" | "NEEDS_REVIEW";

export interface ChiefLearningCandidate {
  readonly candidateId: string;
  readonly source: "learning_proposal";
  readonly contextId: string;
  readonly contextTitle: string;
  readonly commitmentLevel: "REQUIRED" | "IMPORTANT" | "OPTIONAL" | null;
  readonly strategicImportance: number | null;
  readonly studyMode: "CUMULATIVE" | "MIXED" | "CRAMMABLE" | null;
  readonly proposal: LearningTaskProposal;
  readonly assessment: { readonly title: string; readonly dueDate: string } | null;
  readonly forecast: {
    readonly status: "PROJECTED" | "ALREADY_COMPLETE" | "UNKNOWN" | "BEYOND_HORIZON";
    readonly projectedCompletionDate: string | null;
    readonly scheduleSlackDays: number | null;
  };
  readonly judgmentState: LearningJudgmentState;
  readonly evidenceRefs: readonly string[];
}

export interface LearningCandidateProviderContext {
  readonly contextId: string;
  readonly contextTitle: string;
  readonly commitmentLevel: ChiefLearningCandidate["commitmentLevel"];
  readonly strategicImportance: number | null;
  readonly studyMode: ChiefLearningCandidate["studyMode"];
  readonly proposal: LearningTaskProposal | null;
  readonly canonicalActiveTaskId: string | null;
  readonly assessment: ChiefLearningCandidate["assessment"];
  readonly forecast: ChiefLearningCandidate["forecast"];
  readonly judgmentState: LearningJudgmentState;
  readonly evidenceRefs?: readonly string[];
}

/** Maps canonical Learning output into Chief input without re-evaluating Learning policy. */
export function provideChiefLearningCandidates(
  contexts: readonly LearningCandidateProviderContext[]
): readonly ChiefLearningCandidate[] {
  return contexts.flatMap((context) => {
    if (context.canonicalActiveTaskId || !context.proposal) return [];
    if (context.proposal.assignedUnits <= 0 || !context.proposal.title.trim() || !context.proposal.completionCriteria.trim()) return [];
    return [{
      candidateId: `learning:${context.proposal.materializationKey}`,
      source: "learning_proposal" as const,
      contextId: context.contextId,
      contextTitle: context.contextTitle,
      commitmentLevel: context.commitmentLevel,
      strategicImportance: context.strategicImportance,
      studyMode: context.studyMode,
      proposal: context.proposal,
      assessment: context.assessment,
      forecast: context.forecast,
      judgmentState: context.judgmentState,
      evidenceRefs: [
        `work-context:${context.contextId}`,
        `learning-material:${context.proposal.materialId}`,
        `learning-stage:${context.proposal.stageId}`,
        `learning-scope:${context.proposal.materializationKey}`,
        ...(context.evidenceRefs ?? [])
      ]
    }];
  });
}
