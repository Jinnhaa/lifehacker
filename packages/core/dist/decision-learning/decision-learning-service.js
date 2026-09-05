export const DECISION_REASON_QUESTION = "알겠어. 다음에도 참고하려고 하나만 물어볼게. 왜 이렇게 바꾸고 싶어?";
export const extractExplicitDecisionReason = (text) => {
    const trimmed = text.trim();
    const labeled = /(?:왜냐하면|이유는|because)\s*[:：]?\s*(.+)$/i.exec(trimmed);
    if (labeled?.[1]?.trim())
        return labeled[1].trim();
    return /(?:때문|해서|라서|니까|므로|으니까)/.test(trimmed) ? trimmed : null;
};
export const hasDecisionReasonSignal = (text) => extractExplicitDecisionReason(text) !== null;
export class DecisionLearningService {
    repository;
    clock;
    patternLearning;
    constructor(dependencies) {
        this.repository = dependencies.repository;
        this.clock = dependencies.clock;
        this.patternLearning = dependencies.patternLearning;
    }
    async recordMaterialDecision(input) {
        const reason = extractExplicitDecisionReason(input.userMessage);
        const record = await this.repository.recordMaterialDecision(input, reason);
        return record.created && record.needsReason ? DECISION_REASON_QUESTION : null;
    }
    async handleReasonMessage(message) {
        const reason = extractExplicitDecisionReason(message.text);
        if (!reason)
            return { handled: false };
        const stored = await this.repository.recordPendingReason(message.userId, reason, message.messageId, this.clock.now());
        return stored
            ? { handled: true, reply: "알려줘서 고마워. 다음 판단에 참고할게." }
            : { handled: false };
    }
    async collectDayCloseOutcomes(input) {
        const created = await this.repository.createLearningCasesForDay(input);
        try {
            await this.patternLearning?.evaluatePatterns(input.userId);
        }
        catch {
            // LearningCase collection remains successful; a later Day Close retry can evaluate patterns.
        }
        return created;
    }
}
//# sourceMappingURL=decision-learning-service.js.map