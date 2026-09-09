import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { AiExecutionAttempt, AiTaskExecutionRepository, AiTaskExecutionTarget, DocumentDraftResult } from "./ai-task-execution.js";
export declare class SupabaseAiTaskExecutionRepository implements AiTaskExecutionRepository {
    private readonly sql;
    private readonly bootstrap;
    constructor(sql: Sql);
    loadTarget(userId: UserId, taskStepId: string): Promise<AiTaskExecutionTarget | null>;
    findSuccessful(userId: UserId, executionKey: string): Promise<{
        agentRunId: string;
        artifactId: string;
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
//# sourceMappingURL=supabase-ai-task-execution-repository.d.ts.map