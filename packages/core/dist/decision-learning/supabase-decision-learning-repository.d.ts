import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { DecisionLearningRepository, DecisionOutcomeInput, MaterialDecisionInput, MaterialDecisionRecord } from "./decision-learning.js";
export declare class SupabaseDecisionLearningRepository implements DecisionLearningRepository {
    private readonly sql;
    constructor(sql: Sql);
    recordMaterialDecision(input: MaterialDecisionInput, userReason: string | null): Promise<MaterialDecisionRecord>;
    recordPendingReason(userId: UserId, reason: string, messageId: string, now: Date): Promise<boolean>;
    createLearningCasesForDay(input: DecisionOutcomeInput): Promise<number>;
}
//# sourceMappingURL=supabase-decision-learning-repository.d.ts.map