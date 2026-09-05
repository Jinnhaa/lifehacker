import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { type PatternEvaluationResult, type PatternLearningEvaluator } from "./pattern-learning.js";
export declare class SupabasePatternLearningRepository implements PatternLearningEvaluator {
    private readonly sql;
    constructor(sql: Sql);
    evaluatePatterns(userId: UserId): Promise<PatternEvaluationResult>;
}
//# sourceMappingURL=supabase-pattern-learning-repository.d.ts.map