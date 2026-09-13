import { DomainError, type Clock, type UserId } from "@amber/shared";
import type { AiTaskExecutionResult } from "../agent-execution/ai-task-execution.js";
import type { ProjectPmRepository, ProjectWorkContext } from "../project-pm/project-pm.js";
import type { BacklogApprovalResult } from "./backlog-approval.js";
import type { ProjectLeadershipRunResult } from "./project-leadership.js";
import { projectProjectState, projectStateFingerprint } from "./project-state-projector.js";
import { deriveProjectRuntimeSummary, type ProjectRuntimeActionResult, type ProjectRuntimeRepository, type ProjectRuntimeSummary } from "./project-runtime.js";

type Leadership = { run(input: { userId: UserId; workContextId: string; timeZone: string; idempotencyKey: string }): Promise<ProjectLeadershipRunResult> };
type Approval = {
  requestApproval(input: { userId: UserId; proposalArtifactId: string; proposalHash: string; idempotencyKey: string }): Promise<{ id: string }>;
  decide(input: unknown, timeZone: string): Promise<BacklogApprovalResult>;
};
type Execution = { dispatch(input: { userId: UserId; taskStepId: string; timeZone: string }): Promise<AiTaskExecutionResult> };

const localDate = (value: Date, timeZone: string): string => {
  const fields = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const read = (type: string): string => fields.find((field) => field.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

export class ProjectRuntimeService {
  constructor(private readonly dependencies: {
    readonly projectRepository: ProjectPmRepository;
    readonly runtimeRepository: ProjectRuntimeRepository;
    readonly leadershipService: Leadership;
    readonly approvalService: Approval;
    readonly executionService: Execution;
    readonly clock: Clock;
  }) {}

  async list(userId: UserId): Promise<readonly ProjectRuntimeSummary[]> {
    const projects = await this.dependencies.projectRepository.listProjects(userId);
    return Promise.all(projects.map((project) => this.summary(userId, project)));
  }

  async startOrContinue(input: { readonly userId: UserId; readonly workContextId: string; readonly timeZone: string }): Promise<ProjectRuntimeActionResult> {
    const project = await this.project(input.userId, input.workContextId);
    let summary = await this.summary(input.userId, project);
    if (["review_proposal", "wait_for_ai", "complete_human_work", "review_artifact", "none"].includes(summary.nextAction)) {
      return { summary, executions: [] };
    }
    if (summary.nextAction === "run_ai") {
      const executions = await this.dispatch(summary, input.userId, input.timeZone);
      return { summary: await this.summary(input.userId, project), executions };
    }

    let proposal = summary.proposal;
    if (summary.nextAction === "start_iteration") {
      const now = this.dependencies.clock.now();
      const context = await this.dependencies.projectRepository.loadProjectContext(
        input.userId, project, localDate(now, input.timeZone), input.timeZone, now
      );
      const fingerprint = projectStateFingerprint(projectProjectState(context));
      const iteration = await this.dependencies.leadershipService.run({
        ...input,
        idempotencyKey: summary.iterationState === "failed" && summary.iterationId
          ? `project-runtime-retry:${summary.iterationId}:${fingerprint}`
          : `project-runtime:${project.id}:${fingerprint}`
      });
      proposal = {
        id: iteration.backlogProposal.id,
        contentHash: iteration.backlogProposal.contentHash,
        items: iteration.backlogProposal.content.items.map((item) => ({
          key: item.key, title: item.title, description: item.description, owner: item.suggestedOwner,
          priority: item.suggestedPriority, dependencies: item.dependencies
        }))
      };
    }
    if (!proposal) throw new DomainError("CONFLICT", "Project backlog proposal is not available");
    await this.dependencies.approvalService.requestApproval({
      userId: input.userId,
      proposalArtifactId: proposal.id,
      proposalHash: proposal.contentHash,
      idempotencyKey: `backlog-approval:${proposal.id}`
    });
    summary = await this.summary(input.userId, project);
    return { summary, executions: [] };
  }

  async decideBacklog(input: {
    readonly userId: UserId;
    readonly workContextId: string;
    readonly timeZone: string;
    readonly acceptedItemKeys: readonly string[];
    readonly userReason?: string;
  }): Promise<ProjectRuntimeActionResult> {
    const project = await this.project(input.userId, input.workContextId);
    const before = await this.summary(input.userId, project);
    if (!before.proposal || before.approval?.status !== "pending") {
      throw new DomainError("CONFLICT", "Pending Project backlog approval is not available");
    }
    const accepted = new Set(input.acceptedItemKeys);
    if ([...accepted].some((key) => !before.proposal!.items.some((item) => item.key === key))) {
      throw new DomainError("INVALID_INPUT", "Unknown Project backlog item was selected");
    }
    const result = await this.dependencies.approvalService.decide({
      userId: input.userId,
      approvalRequestId: before.approval.id,
      proposalArtifactId: before.proposal.id,
      proposalHash: before.proposal.contentHash,
      acceptedItems: before.proposal.items.filter((item) => accepted.has(item.key)).map((item) => ({ proposalItemKey: item.key })),
      excludedItems: before.proposal.items.filter((item) => !accepted.has(item.key)).map((item) => ({ proposalItemKey: item.key })),
      ...(input.userReason ? { userReason: input.userReason } : {})
    }, input.timeZone);
    const executions = await Promise.all(result.tasks.flatMap((task) => task.steps)
      .filter((step) => step.route === "ai_executable")
      .map((step) => this.dependencies.executionService.dispatch({ userId: input.userId, taskStepId: step.id, timeZone: input.timeZone })));
    return { summary: await this.summary(input.userId, project), executions };
  }

  private async dispatch(summary: ProjectRuntimeSummary, userId: UserId, timeZone: string): Promise<readonly AiTaskExecutionResult[]> {
    return Promise.all(summary.aiExecutableSteps.map((step) => this.dependencies.executionService.dispatch({
      userId, taskStepId: step.id, timeZone
    })));
  }

  private async summary(userId: UserId, project: ProjectWorkContext): Promise<ProjectRuntimeSummary> {
    return deriveProjectRuntimeSummary(await this.dependencies.runtimeRepository.loadFacts(userId, project));
  }

  private async project(userId: UserId, workContextId: string): Promise<ProjectWorkContext> {
    const projects = await this.dependencies.projectRepository.listProjects(userId);
    const project = projects.find((item) => item.id === workContextId);
    if (!project) throw new DomainError("INVALID_INPUT", "Project WorkContext not found");
    return project;
  }
}
