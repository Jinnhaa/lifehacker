import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
export type BuiltInAgentType = "chief" | "project_pm";
export interface AgentInstanceRef {
    readonly id: string;
    readonly templateVersion: string;
    readonly homeScopeId: string;
}
export declare class AgentBootstrapService {
    private readonly sql;
    constructor(sql: Sql);
    ensureAgentInstance(userId: UserId, agentType: BuiltInAgentType, requiredScopeId?: string): Promise<AgentInstanceRef | null>;
}
//# sourceMappingURL=agent-bootstrap.d.ts.map