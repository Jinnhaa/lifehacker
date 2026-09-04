import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { CurrentAction, MorningCheckpoint, MorningObservation, MorningPlan, MorningPlanDraft, MorningRepository, MorningStep, MorningWorkflowRun } from "./morning.js";
export declare class SupabaseMorningRepository implements MorningRepository {
    private readonly sql;
    constructor(sql: Sql);
    getOrCreateWorkflow(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<MorningWorkflowRun>;
    findTodayWorkflow(userId: UserId, planDate: string): Promise<MorningWorkflowRun | null>;
    loadObservation(userId: UserId, planDate: string, timeZone: string): Promise<MorningObservation>;
    updateCheckpoint(run: MorningWorkflowRun, checkpoint: MorningCheckpoint, step: MorningStep, status: MorningWorkflowRun["status"], now: Date, messageId: string): Promise<MorningWorkflowRun>;
    createProposal(run: MorningWorkflowRun, draft: MorningPlanDraft, now: Date, messageId: string): Promise<MorningPlan>;
    getProposal(run: MorningWorkflowRun): Promise<MorningPlan | null>;
    approve(run: MorningWorkflowRun, now: Date, messageId: string): Promise<{
        plan: MorningPlan;
        duplicate: boolean;
    }>;
    deriveCurrentAction(userId: UserId, planDate: string): Promise<CurrentAction | null>;
    private getPlan;
}
//# sourceMappingURL=supabase-morning-repository.d.ts.map