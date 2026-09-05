import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { MorningPlanDraft } from "../morning/morning.js";
import type { ReplanDecision, ReplanPlanState, ReplanRepository, ReplanRevisionResult, ReplanTrigger, ReplanWorkflowRun } from "./replan.js";
export declare class SupabaseReplanRepository implements ReplanRepository {
    private readonly sql;
    constructor(sql: Sql);
    findLatestPendingTrigger(userId: UserId): Promise<ReplanTrigger | null>;
    createManualTrigger(userId: UserId, now: Date, messageId: string): Promise<ReplanTrigger>;
    findPendingApproval(userId: UserId, planDate: string): Promise<ReplanWorkflowRun | null>;
    findCompletedApprovalByMessage(userId: UserId, planDate: string, messageId: string): Promise<ReplanWorkflowRun | null>;
    findByTrigger(userId: UserId, triggerId: string): Promise<ReplanRevisionResult | null>;
    loadPlanState(userId: UserId, planDate: string): Promise<ReplanPlanState | null>;
    createRevision(trigger: ReplanTrigger, stateHash: string, previous: ReplanPlanState, draft: MorningPlanDraft, decision: ReplanDecision, now: Date): Promise<ReplanRevisionResult>;
    deriveCurrentAction(userId: UserId, planDate: string): Promise<import("../execution/current-action.js").DerivedCurrentAction | null>;
    private loadItems;
    private recordTriggerExecution;
    private insertItems;
    private getPlan;
}
//# sourceMappingURL=supabase-replan-repository.d.ts.map