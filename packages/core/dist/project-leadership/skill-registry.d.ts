import { z } from "zod";
import { type BacklogRefinementInput, type BacklogRefinementResult, type GapAnalysisResult, type ProjectStateReviewInput } from "./project-leadership.js";
export interface SkillDefinition<Input, Output> {
    readonly key: "project-state-review" | "backlog-refinement";
    readonly version: "1";
    readonly inputSchema: z.ZodType<Input>;
    readonly outputSchema: z.ZodType<Output>;
    readonly allowedCapabilities: readonly string[];
    readonly completionCriteria: readonly string[];
    verify(input: Input, output: Output): readonly string[];
}
export declare const projectStateReviewSkill: SkillDefinition<ProjectStateReviewInput, GapAnalysisResult>;
export declare const backlogRefinementSkill: SkillDefinition<BacklogRefinementInput, BacklogRefinementResult>;
export declare const projectLeadershipSkillRegistry: {
    readonly [projectStateReviewSkill.key]: SkillDefinition<ProjectStateReviewInput, {
        gaps: {
            key: string;
            title: string;
            description: string;
            evidenceRefs: string[];
            priorityHint: "low" | "medium" | "high" | "critical";
            confidence: number;
            blocking: boolean;
            rationale: string;
        }[];
        unknowns: string[];
    }>;
    readonly [backlogRefinementSkill.key]: SkillDefinition<BacklogRefinementInput, {
        items: {
            key: string;
            sourceGapKey: string;
            objectiveId: string;
            title: string;
            description: string;
            suggestedPriority: "low" | "medium" | "high" | "critical";
            suggestedOwner: "human" | "ai" | "hybrid";
            acceptanceCriteria: string[];
            dependencies: string[];
            roughSize: "xs" | "s" | "m" | "l" | "xl" | null;
            evidenceRefs: string[];
            risk: string | null;
        }[];
        unknowns: string[];
    }>;
};
//# sourceMappingURL=skill-registry.d.ts.map