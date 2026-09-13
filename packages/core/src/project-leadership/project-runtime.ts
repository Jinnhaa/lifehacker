import type { UserId } from "@amber/shared";
import type { AiTaskExecutionResult } from "../agent-execution/ai-task-execution.js";
import type { ProjectWorkContext } from "../project-pm/project-pm.js";
import type { BacklogProposalArtifact, GapAnalysisArtifact, ProjectStateSnapshot } from "./project-leadership.js";

export type ProjectRuntimeNextAction =
  | "start_iteration"
  | "request_approval"
  | "review_proposal"
  | "run_ai"
  | "wait_for_ai"
  | "complete_human_work"
  | "review_artifact"
  | "none";

export interface ProjectRuntimeStep {
  readonly id: string;
  readonly title: string;
  readonly owner: "user" | "ai";
  readonly status: string;
  readonly dependenciesResolved: boolean;
}

export interface ProjectRuntimeFacts {
  readonly project: ProjectWorkContext;
  readonly iteration: null | {
    readonly id: string;
    readonly status: "running" | "completed" | "failed";
    readonly currentStep: string | null;
    readonly snapshot: { readonly id: string; readonly content: ProjectStateSnapshot } | null;
    readonly gapAnalysis: { readonly id: string; readonly content: GapAnalysisArtifact } | null;
    readonly backlogProposal: { readonly id: string; readonly contentHash: string; readonly content: BacklogProposalArtifact } | null;
  };
  readonly approval: null | { readonly id: string; readonly status: "pending" | "approved" | "rejected" | "expired" | "cancelled" };
  readonly openSteps: readonly ProjectRuntimeStep[];
  readonly runningAgentRunCount: number;
  readonly pendingReviewArtifacts: readonly { readonly id: string; readonly title: string | null }[];
  readonly waitingForUserCount: number;
}

export interface ProjectRuntimeSummary {
  readonly project: { readonly id: string; readonly title: string; readonly status: string };
  readonly iterationId: string | null;
  readonly iterationState: "not_started" | "analyzing" | "proposal_ready" | "approval_required" | "ai_ready" | "ai_running" | "waiting_for_user" | "review_required" | "blocked" | "complete" | "failed" | "needs_setup";
  readonly stateLabel: string;
  readonly snapshot: null | { readonly id: string; readonly generatedAt: string };
  readonly currentGap: null | { readonly title: string; readonly description: string };
  readonly proposal: null | {
    readonly id: string;
    readonly contentHash: string;
    readonly items: readonly {
      readonly key: string;
      readonly title: string;
      readonly description: string;
      readonly owner: "human" | "ai" | "hybrid";
      readonly priority: "low" | "medium" | "high" | "critical";
      readonly dependencies: readonly string[];
    }[];
  };
  readonly approval: ProjectRuntimeFacts["approval"];
  readonly aiExecutableSteps: readonly { readonly id: string; readonly title: string }[];
  readonly runningWorkCount: number;
  readonly waitingForUserCount: number;
  readonly pendingReviewCount: number;
  readonly nextAction: ProjectRuntimeNextAction;
  readonly nextActionLabel: string;
}

export interface ProjectRuntimeRepository {
  loadFacts(userId: UserId, project: ProjectWorkContext): Promise<ProjectRuntimeFacts>;
}

const label = (action: ProjectRuntimeNextAction): string => ({
  start_iteration: "프로젝트 분석 시작",
  request_approval: "제안 검토 준비",
  review_proposal: "Backlog 제안 검토",
  run_ai: "AI 작업 시작",
  wait_for_ai: "AI 작업 중",
  complete_human_work: "사용자 작업 필요",
  review_artifact: "Artifact 검토",
  none: "현재 iteration 완료"
})[action];

export const deriveProjectRuntimeSummary = (facts: ProjectRuntimeFacts): ProjectRuntimeSummary => {
  const proposal = facts.iteration?.backlogProposal;
  const pendingReviewCount = facts.pendingReviewArtifacts.length;
  const aiExecutableSteps = facts.openSteps
    .filter((step) => step.owner === "ai" && step.dependenciesResolved && ["pending", "in_progress"].includes(step.status))
    .map(({ id, title }) => ({ id, title }));
  let iterationState: ProjectRuntimeSummary["iterationState"];
  let nextAction: ProjectRuntimeNextAction;

  if (!facts.project.scopeId) [iterationState, nextAction] = ["needs_setup", "none"];
  else if (pendingReviewCount > 0) [iterationState, nextAction] = ["review_required", "review_artifact"];
  else if (facts.approval?.status === "pending") [iterationState, nextAction] = ["approval_required", "review_proposal"];
  else if (!facts.iteration) [iterationState, nextAction] = ["not_started", "start_iteration"];
  else if (facts.iteration.status === "running") [iterationState, nextAction] = ["analyzing", "none"];
  else if (facts.iteration.status === "failed") [iterationState, nextAction] = ["failed", "start_iteration"];
  else if (proposal && !facts.approval) [iterationState, nextAction] = ["proposal_ready", "request_approval"];
  else if (facts.runningAgentRunCount > 0) [iterationState, nextAction] = ["ai_running", "wait_for_ai"];
  else if (aiExecutableSteps.length > 0) [iterationState, nextAction] = ["ai_ready", "run_ai"];
  else if (facts.waitingForUserCount > 0 || facts.openSteps.some((step) => step.owner === "user" && step.dependenciesResolved)) {
    [iterationState, nextAction] = ["waiting_for_user", "complete_human_work"];
  }
  else if (facts.openSteps.length > 0) [iterationState, nextAction] = ["blocked", "none"];
  else [iterationState, nextAction] = ["complete", "start_iteration"];

  const gap = facts.iteration?.gapAnalysis?.content.gaps
    .find((item) => item.blocking) ?? facts.iteration?.gapAnalysis?.content.gaps[0] ?? null;
  return {
    project: { id: facts.project.id, title: facts.project.title, status: facts.project.status },
    iterationId: facts.iteration?.id ?? null,
    iterationState,
    stateLabel: iterationState === "not_started" ? "분석 전"
      : iterationState === "analyzing" ? "분석 중"
        : iterationState === "proposal_ready" ? "제안 준비됨"
          : iterationState === "approval_required" ? "승인 필요"
            : iterationState === "ai_ready" ? "AI 실행 가능"
              : iterationState === "ai_running" ? "AI 작업 중"
                : iterationState === "waiting_for_user" ? "사용자 작업 필요"
                  : iterationState === "review_required" ? "검토 필요"
                    : iterationState === "blocked" ? "선행 작업 대기"
                    : iterationState === "failed" ? "분석 실패"
                      : iterationState === "needs_setup" ? "프로젝트 scope 필요" : "현재 단계 완료",
    snapshot: facts.iteration?.snapshot ? {
      id: facts.iteration.snapshot.id,
      generatedAt: facts.iteration.snapshot.content.generatedAt
    } : null,
    currentGap: gap ? { title: gap.title, description: gap.description } : null,
    proposal: proposal ? {
      id: proposal.id,
      contentHash: proposal.contentHash,
      items: proposal.content.items.map((item) => ({
        key: item.key,
        title: item.title,
        description: item.description,
        owner: item.suggestedOwner,
        priority: item.suggestedPriority,
        dependencies: item.dependencies
      }))
    } : null,
    approval: facts.approval,
    aiExecutableSteps,
    runningWorkCount: facts.runningAgentRunCount,
    waitingForUserCount: facts.waitingForUserCount,
    pendingReviewCount,
    nextAction,
    nextActionLabel: iterationState === "analyzing" ? "분석 진행 중"
      : iterationState === "failed" ? "분석 다시 시도"
        : iterationState === "needs_setup" ? "Project scope 연결 필요"
          : iterationState === "blocked" ? "선행 작업 완료 대기"
          : iterationState === "complete" ? "다음 단계 분석"
          : label(nextAction)
  };
};

export interface ProjectRuntimeActionResult {
  readonly summary: ProjectRuntimeSummary;
  readonly executions: readonly AiTaskExecutionResult[];
}
