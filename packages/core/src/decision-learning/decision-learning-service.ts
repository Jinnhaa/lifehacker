import type {
  DecisionLearningCollector,
  DecisionLearningDependencies,
  DecisionLearningRecorder,
  DecisionOutcomeInput,
  DecisionReasonMessage,
  DecisionReasonResult,
  MaterialDecisionInput
} from "./decision-learning.js";

export const DECISION_REASON_QUESTION = "알겠어. 다음에도 참고하려고 하나만 물어볼게. 왜 이렇게 바꾸고 싶어?";

export const extractExplicitDecisionReason = (text: string): string | null => {
  const trimmed = text.trim();
  const labeled = /(?:왜냐하면|이유는|because)\s*[:：]?\s*(.+)$/i.exec(trimmed);
  if (labeled?.[1]?.trim()) return labeled[1].trim();
  return /(?:때문|해서|라서|니까|므로|으니까)/.test(trimmed) ? trimmed : null;
};

export const hasDecisionReasonSignal = (text: string): boolean => extractExplicitDecisionReason(text) !== null;

export class DecisionLearningService implements DecisionLearningRecorder, DecisionLearningCollector {
  private readonly repository: DecisionLearningDependencies["repository"];
  private readonly clock: DecisionLearningDependencies["clock"];

  constructor(dependencies: DecisionLearningDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
  }

  async recordMaterialDecision(input: MaterialDecisionInput): Promise<string | null> {
    const reason = extractExplicitDecisionReason(input.userMessage);
    const record = await this.repository.recordMaterialDecision(input, reason);
    return record.created && record.needsReason ? DECISION_REASON_QUESTION : null;
  }

  async handleReasonMessage(message: DecisionReasonMessage): Promise<DecisionReasonResult> {
    const reason = extractExplicitDecisionReason(message.text);
    if (!reason) return { handled: false };
    const stored = await this.repository.recordPendingReason(
      message.userId, reason, message.messageId, this.clock.now()
    );
    return stored
      ? { handled: true, reply: "알려줘서 고마워. 다음 판단에 참고할게." }
      : { handled: false };
  }

  collectDayCloseOutcomes(input: DecisionOutcomeInput): Promise<number> {
    return this.repository.createLearningCasesForDay(input);
  }
}
