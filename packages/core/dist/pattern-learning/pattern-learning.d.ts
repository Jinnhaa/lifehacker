import type { UserId } from "@amber/shared";
export declare const PATTERN_EVALUATOR_VERSION = "decision-pattern-v0.1";
export declare const MIN_PATTERN_EVIDENCE = 3;
export interface PatternLearningCase {
    readonly id: string;
    readonly decisionType: string;
    readonly situation: Readonly<Record<string, unknown>>;
    readonly userChoice: Readonly<Record<string, unknown>>;
    readonly userReason: string | null;
    readonly observedOutcome: Readonly<Record<string, unknown>>;
    readonly observedAt: Date;
}
export interface PatternCandidate {
    readonly signature: string;
    readonly decisionType: string;
    readonly situationType: string;
    readonly choiceAction: string;
    readonly consistencyKind: "reason" | "outcome";
    readonly consistencyValue: string;
    readonly observedBehavior: string;
    readonly evidence: readonly PatternLearningCase[];
    readonly confidence: number;
}
export interface PatternEvaluationResult {
    readonly created: number;
    readonly strengthened: number;
}
export interface PatternLearningEvaluator {
    evaluatePatterns(userId: UserId): Promise<PatternEvaluationResult>;
}
export declare const derivePatternCandidates: (cases: readonly PatternLearningCase[]) => PatternCandidate[];
//# sourceMappingURL=pattern-learning.d.ts.map