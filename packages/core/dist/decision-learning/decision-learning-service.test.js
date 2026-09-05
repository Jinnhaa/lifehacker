import { FixedClock } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { DECISION_REASON_QUESTION, DecisionLearningService } from "./decision-learning-service.js";
const userId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-04T12:00:00.000Z");
const input = (userMessage) => ({
    userId,
    workflowRunId: "20000000-0000-4000-8000-000000000001",
    idempotencyKey: "important:one",
    decisionType: "important_replan",
    situation: { planDate: "2026-09-04", impactReasons: ["deadline_risk_increased"] },
    amberRecommendation: { action: "apply_replanned_schedule" },
    userChoice: { action: "reject" },
    userMessage,
    occurredAt: now
});
const repository = () => ({
    recordMaterialDecision: vi.fn().mockResolvedValue({
        decisionId: "decision", feedbackId: "feedback", created: true, needsReason: true
    }),
    recordPendingReason: vi.fn().mockResolvedValue(true),
    createLearningCasesForDay: vi.fn().mockResolvedValue(0)
});
describe("DecisionLearningService", () => {
    it("asks once when a material override has no reason", async () => {
        const repo = repository();
        const service = new DecisionLearningService({ repository: repo, clock: new FixedClock(now) });
        expect(await service.recordMaterialDecision(input("거절"))).toBe(DECISION_REASON_QUESTION);
        vi.mocked(repo.recordMaterialDecision).mockResolvedValue({
            decisionId: "decision", feedbackId: "feedback", created: false, needsReason: true
        });
        expect(await service.recordMaterialDecision(input("거절"))).toBeNull();
    });
    it("preserves an explicit reason and does not ask again", async () => {
        const repo = repository();
        vi.mocked(repo.recordMaterialDecision).mockResolvedValue({
            decisionId: "decision", feedbackId: "feedback", created: true, needsReason: false
        });
        const service = new DecisionLearningService({ repository: repo, clock: new FixedClock(now) });
        expect(await service.recordMaterialDecision(input("거절, 마감 과제가 더 중요해서"))).toBeNull();
        expect(repo.recordMaterialDecision).toHaveBeenCalledWith(input("거절, 마감 과제가 더 중요해서"), "거절, 마감 과제가 더 중요해서");
    });
    it("records a later explicit reason without blocking unrelated messages", async () => {
        const repo = repository();
        const service = new DecisionLearningService({ repository: repo, clock: new FixedClock(now) });
        await expect(service.handleReasonMessage({ userId, text: "그냥 기록해줘", messageId: "ordinary", receivedAt: now }))
            .resolves.toEqual({ handled: false });
        await expect(service.handleReasonMessage({ userId, text: "이유는 마감이 더 중요해서", messageId: "reason", receivedAt: now }))
            .resolves.toEqual({ handled: true, reply: "알려줘서 고마워. 다음 판단에 참고할게." });
        expect(repo.recordPendingReason).toHaveBeenCalledWith(userId, "마감이 더 중요해서", "reason", now);
    });
});
//# sourceMappingURL=decision-learning-service.test.js.map