import { userIdSchema, type UserId } from "@amber/shared";
import { z } from "zod";
import type { ProjectPmContext } from "../project-pm/project-pm.js";

export const documentDraftResultSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  body: z.string().trim().min(1),
  addressedCriteria: z.array(z.string().trim().min(1)).min(1),
  sourceRefs: z.array(z.string().trim().min(1)).min(1),
  uncertainties: z.array(z.string().trim().min(1))
}).strict();
export type DocumentDraftResult = z.infer<typeof documentDraftResultSchema>;

export const documentDraftArtifactContentSchema = documentDraftResultSchema.extend({
  schemaVersion: z.literal("1"),
  skillKey: z.literal("document-draft"),
  taskStepId: z.string().uuid()
}).strict();

export interface AiTaskExecutionTarget {
  readonly userId: UserId;
  readonly taskStepId: string;
  readonly taskId: string;
  readonly workContextId: string;
  readonly scopeId: string;
  readonly owner: "user" | "ai";
  readonly status: string;
  readonly taskStatus: string;
  readonly skillKey: string | null;
}

export interface DocumentDraftInput {
  readonly userId: UserId;
  readonly workflowRunId: string;
  readonly agentRunId: string;
  readonly contextPackageId: string;
  readonly workContext: { readonly id: string; readonly title: string; readonly description: string | null };
  readonly objective: { readonly id: string; readonly title: string; readonly successCriteria: string | null } | null;
  readonly task: { readonly id: string; readonly title: string; readonly description: string | null; readonly completionCriteria: string | null };
  readonly taskStep: { readonly id: string; readonly title: string; readonly completionCriteria: string | null };
  readonly acceptedArtifacts: readonly { readonly id: string; readonly artifactType: string; readonly title: string | null; readonly contentText: string | null; readonly contentHash: string | null }[];
  readonly decisions: readonly { readonly id: string; readonly question: string; readonly whyNow: string; readonly status: string }[];
  readonly sourceRefs: readonly string[];
  readonly executionConstraints: readonly string[];
  readonly revisionRequest?: {
    readonly revisionOfArtifactId: string;
    readonly decisionId: string;
    readonly instruction: string;
    readonly originalContentText: string;
    readonly originalContentHash: string;
  } | undefined;
}

export const documentDraftInputSchema: z.ZodType<DocumentDraftInput> = z.object({
  userId: userIdSchema, workflowRunId: z.string().uuid(), agentRunId: z.string().uuid(), contextPackageId: z.string().uuid(),
  workContext: z.object({ id: z.string().uuid(), title: z.string().min(1), description: z.string().nullable() }),
  objective: z.object({ id: z.string().uuid(), title: z.string().min(1), successCriteria: z.string().nullable() }).nullable(),
  task: z.object({ id: z.string().uuid(), title: z.string().min(1), description: z.string().nullable(), completionCriteria: z.string().nullable() }),
  taskStep: z.object({ id: z.string().uuid(), title: z.string().min(1), completionCriteria: z.string().nullable() }),
  acceptedArtifacts: z.array(z.object({ id: z.string().uuid(), artifactType: z.string().min(1), title: z.string().nullable(), contentText: z.string().nullable(), contentHash: z.string().nullable() })),
  decisions: z.array(z.object({ id: z.string().uuid(), question: z.string().min(1), whyNow: z.string().min(1), status: z.string().min(1) })),
  sourceRefs: z.array(z.string().min(1)).min(1), executionConstraints: z.array(z.string().min(1)).min(1),
  revisionRequest: z.object({ revisionOfArtifactId: z.string().uuid(), decisionId: z.string().uuid(), instruction: z.string().trim().min(1),
    originalContentText: z.string().min(1), originalContentHash: z.string().length(64) }).strict().optional()
});

export interface AiTaskExecutor {
  executeDocumentDraft(input: DocumentDraftInput): Promise<unknown>;
}

export interface AiExecutionAttempt {
  readonly kind: "started";
  readonly workflowRunId: string;
  readonly agentRunId: string;
  readonly contextPackageId: string;
  readonly attemptNumber: number;
}

export interface AiTaskExecutionRepository {
  loadTarget(userId: UserId, taskStepId: string): Promise<AiTaskExecutionTarget | null>;
  findSuccessful(userId: UserId, executionKey: string): Promise<{ readonly agentRunId: string; readonly artifactId: string } | null>;
  startAttempt(input: {
    readonly target: AiTaskExecutionTarget; readonly executionKey: string; readonly contextHash: string;
    readonly contextPayload: Readonly<Record<string, unknown>>; readonly sourceRefs: readonly string[];
    readonly skillKey: string; readonly skillVersion: string; readonly maxAttempts: number; readonly now: Date;
  }): Promise<AiExecutionAttempt | { readonly kind: "busy" | "exhausted" | "reused"; readonly agentRunId?: string; readonly artifactId?: string }>;
  completeAttempt(input: { readonly target: AiTaskExecutionTarget; readonly attempt: AiExecutionAttempt; readonly executionKey: string; readonly result: DocumentDraftResult; readonly sourceRefs: readonly string[]; readonly revisionOfArtifactId?: string; readonly now: Date }): Promise<string>;
  failAttempt(input: { readonly target: AiTaskExecutionTarget; readonly attempt: AiExecutionAttempt; readonly code: string; readonly reason: string; readonly terminal: boolean; readonly now: Date }): Promise<void>;
  blockWithoutAttempt(input: { readonly target: AiTaskExecutionTarget; readonly code: string; readonly reason: string; readonly now: Date }): Promise<void>;
}

export type AiTaskExecutionResult =
  | { readonly status: "waiting_for_review"; readonly agentRunId: string; readonly artifactId: string; readonly attemptNumber: number }
  | { readonly status: "reused"; readonly agentRunId: string; readonly artifactId: string }
  | { readonly status: "busy" | "blocked" };

export const createExecutionContext = (
  context: ProjectPmContext,
  taskStepId: string,
  revisionRequest?: DocumentDraftInput["revisionRequest"]
): Omit<DocumentDraftInput, "workflowRunId" | "agentRunId" | "contextPackageId"> => {
  const step = context.taskSteps.find((item) => item.id === taskStepId)!;
  const task = context.tasks.find((item) => item.id === step.taskId)!;
  const objective = context.objectives.find((item) => item.id === task.objectiveId) ?? null;
  const sourceRefs = [
    `work_context:${context.project.id}`, `task:${task.id}`, `task_step:${step.id}`,
    ...(objective ? [`objective:${objective.id}`] : []),
    ...context.artifacts.filter((item) => item.reviewStatus === null || item.reviewStatus === "accepted").map((item) => `artifact:${item.id}`), ...context.decisions.map((item) => `decision:${item.id}`),
    ...context.sourceReferences.map((item) => `external_reference:${item.id}:${item.externalVersion ?? item.contentHash ?? "unknown"}`)
  ];
  return {
    userId: context.userId,
    workContext: { id: context.project.id, title: context.project.title, description: context.project.description },
    objective: objective ? { id: objective.id, title: objective.title, successCriteria: objective.successCriteria } : null,
    task: { id: task.id, title: task.title, description: task.description, completionCriteria: task.completionCriteria },
    taskStep: { id: step.id, title: step.title, completionCriteria: step.completionCriteria },
    acceptedArtifacts: context.artifacts.filter((item) => item.reviewStatus === null || item.reviewStatus === "accepted")
      .map((item) => ({ id: item.id, artifactType: item.artifactType, title: item.title, contentText: item.contentText, contentHash: item.contentHash })),
    decisions: context.decisions.map((item) => ({ id: item.id, question: item.question, whyNow: item.whyNow, status: item.status })),
    sourceRefs: [...sourceRefs, ...(revisionRequest ? [`artifact:${revisionRequest.revisionOfArtifactId}`, `decision:${revisionRequest.decisionId}`] : [])],
    executionConstraints: ["read-only project scope", "no external writes", "do not invent facts outside sourceRefs"],
    ...(revisionRequest ? { revisionRequest } : {})
  };
};
