import { type UserId } from "@amber/shared";
import { z } from "zod";
import type { ProjectPmContext } from "../project-pm/project-pm.js";
export declare const documentDraftResultSchema: z.ZodObject<{
    title: z.ZodString;
    summary: z.ZodString;
    body: z.ZodString;
    addressedCriteria: z.ZodArray<z.ZodString>;
    sourceRefs: z.ZodArray<z.ZodString>;
    uncertainties: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type DocumentDraftResult = z.infer<typeof documentDraftResultSchema>;
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
    readonly workContext: {
        readonly id: string;
        readonly title: string;
        readonly description: string | null;
    };
    readonly objective: {
        readonly id: string;
        readonly title: string;
        readonly successCriteria: string | null;
    } | null;
    readonly task: {
        readonly id: string;
        readonly title: string;
        readonly description: string | null;
        readonly completionCriteria: string | null;
    };
    readonly taskStep: {
        readonly id: string;
        readonly title: string;
        readonly completionCriteria: string | null;
    };
    readonly acceptedArtifacts: readonly {
        readonly id: string;
        readonly artifactType: string;
        readonly title: string | null;
        readonly contentText: string | null;
        readonly contentHash: string | null;
    }[];
    readonly decisions: readonly {
        readonly id: string;
        readonly question: string;
        readonly whyNow: string;
        readonly status: string;
    }[];
    readonly sourceRefs: readonly string[];
    readonly executionConstraints: readonly string[];
}
export declare const documentDraftInputSchema: z.ZodType<DocumentDraftInput>;
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
    findSuccessful(userId: UserId, executionKey: string): Promise<{
        readonly agentRunId: string;
        readonly artifactId: string;
    } | null>;
    startAttempt(input: {
        readonly target: AiTaskExecutionTarget;
        readonly executionKey: string;
        readonly contextHash: string;
        readonly contextPayload: Readonly<Record<string, unknown>>;
        readonly sourceRefs: readonly string[];
        readonly skillKey: string;
        readonly skillVersion: string;
        readonly maxAttempts: number;
        readonly now: Date;
    }): Promise<AiExecutionAttempt | {
        readonly kind: "busy" | "exhausted" | "reused";
        readonly agentRunId?: string;
        readonly artifactId?: string;
    }>;
    completeAttempt(input: {
        readonly target: AiTaskExecutionTarget;
        readonly attempt: AiExecutionAttempt;
        readonly executionKey: string;
        readonly result: DocumentDraftResult;
        readonly sourceRefs: readonly string[];
        readonly now: Date;
    }): Promise<string>;
    failAttempt(input: {
        readonly target: AiTaskExecutionTarget;
        readonly attempt: AiExecutionAttempt;
        readonly code: string;
        readonly reason: string;
        readonly terminal: boolean;
        readonly now: Date;
    }): Promise<void>;
    blockWithoutAttempt(input: {
        readonly target: AiTaskExecutionTarget;
        readonly code: string;
        readonly reason: string;
        readonly now: Date;
    }): Promise<void>;
}
export type AiTaskExecutionResult = {
    readonly status: "waiting_for_review";
    readonly agentRunId: string;
    readonly artifactId: string;
    readonly attemptNumber: number;
} | {
    readonly status: "reused";
    readonly agentRunId: string;
    readonly artifactId: string;
} | {
    readonly status: "busy" | "blocked";
};
export declare const createExecutionContext: (context: ProjectPmContext, taskStepId: string) => Omit<DocumentDraftInput, "workflowRunId" | "agentRunId" | "contextPackageId">;
//# sourceMappingURL=ai-task-execution.d.ts.map