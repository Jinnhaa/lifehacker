import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { type BuiltInAgentType } from "./agent-bootstrap.js";
export interface AgentExecutionTraceInput {
    readonly userId: UserId;
    readonly agentTemplateKey: BuiltInAgentType;
    readonly artifactType: string;
    readonly triggerId: string;
    readonly source: string;
    readonly requestKind: string;
    readonly contextPayload: Readonly<Record<string, unknown>>;
    readonly reply: string;
    readonly policyVersion: string;
    readonly startedAt: Date;
    readonly completedAt: Date;
    readonly correlationId?: string;
    readonly requiredScopeId?: string;
    readonly workstyleProfileRevisions?: readonly {
        readonly id: string;
        readonly revision: number;
        readonly scopeType: string;
    }[];
}
export declare class SupabaseAgentRunRecorder {
    private readonly sql;
    private readonly bootstrap;
    constructor(sql: Sql);
    findCompleted(userId: UserId, agentTemplateKey: string, artifactType: string, triggerId: string): Promise<string | null>;
    recordCompleted(input: AgentExecutionTraceInput): Promise<void>;
}
//# sourceMappingURL=supabase-agent-run-recorder.d.ts.map