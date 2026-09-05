import type { DecisionLearningCollector, DecisionLearningDependencies, DecisionLearningRecorder, DecisionOutcomeInput, DecisionReasonMessage, DecisionReasonResult, MaterialDecisionInput } from "./decision-learning.js";
export declare const DECISION_REASON_QUESTION = "\uC54C\uACA0\uC5B4. \uB2E4\uC74C\uC5D0\uB3C4 \uCC38\uACE0\uD558\uB824\uACE0 \uD558\uB098\uB9CC \uBB3C\uC5B4\uBCFC\uAC8C. \uC65C \uC774\uB807\uAC8C \uBC14\uAFB8\uACE0 \uC2F6\uC5B4?";
export declare const extractExplicitDecisionReason: (text: string) => string | null;
export declare const hasDecisionReasonSignal: (text: string) => boolean;
export declare class DecisionLearningService implements DecisionLearningRecorder, DecisionLearningCollector {
    private readonly repository;
    private readonly clock;
    constructor(dependencies: DecisionLearningDependencies);
    recordMaterialDecision(input: MaterialDecisionInput): Promise<string | null>;
    handleReasonMessage(message: DecisionReasonMessage): Promise<DecisionReasonResult>;
    collectDayCloseOutcomes(input: DecisionOutcomeInput): Promise<number>;
}
//# sourceMappingURL=decision-learning-service.d.ts.map