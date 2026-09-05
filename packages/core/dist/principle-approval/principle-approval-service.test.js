import { FixedClock } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { PrincipleApprovalService } from "./principle-approval-service.js";
const userId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-04T12:00:00.000Z");
const proposal = {
    id: "proposal", userId, patternId: "pattern", statement: "마감 위험이 있는 날에는 중요한 마감을 먼저 둔다",
    evidenceCount: 3, revision: 1, origin: "pattern_observed"
};
const repository = () => ({
    createEligibleProposal: vi.fn().mockResolvedValue(proposal),
    findPendingProposal: vi.fn().mockResolvedValue(proposal),
    findReplyByMessage: vi.fn().mockResolvedValue(null),
    approve: vi.fn(), reject: vi.fn(), revise: vi.fn().mockResolvedValue({ ...proposal, revision: 2, origin: "user_explicit" })
});
describe("PrincipleApprovalService", () => {
    it("offers an eligible observed rule without exposing internal terms", async () => {
        const service = new PrincipleApprovalService({ repository: repository(), clock: new FixedClock(now) });
        const reply = await service.afterPatternEvaluation(userId);
        expect(reply).toContain("이런 선택이 3번 반복됐어");
        expect(reply).toContain("승인");
        expect(reply).not.toMatch(/Pattern|Principle|confidence/);
    });
    it.each(["승인", "좋아"])("approves on %s", async (text) => {
        const repo = repository();
        const service = new PrincipleApprovalService({ repository: repo, clock: new FixedClock(now) });
        const result = await service.handlePrincipleApprovalMessage({ userId, text, messageId: "discord:approve", receivedAt: now });
        expect(result.handled).toBe(true);
        expect(repo.approve).toHaveBeenCalledOnce();
    });
    it.each(["거절", "아니"])("rejects on %s", async (text) => {
        const repo = repository();
        const service = new PrincipleApprovalService({ repository: repo, clock: new FixedClock(now) });
        await service.handlePrincipleApprovalMessage({ userId, text, messageId: "discord:reject", receivedAt: now });
        expect(repo.reject).toHaveBeenCalledOnce();
        expect(repo.approve).not.toHaveBeenCalled();
    });
    it("preserves a user edit as a new candidate that still requires approval", async () => {
        const repo = repository();
        const service = new PrincipleApprovalService({ repository: repo, clock: new FixedClock(now) });
        const result = await service.handlePrincipleApprovalMessage({
            userId, text: "수정: 시험이나 발표가 24시간 이내일 때만", messageId: "discord:revise", receivedAt: now
        });
        expect(repo.revise).toHaveBeenCalledWith(proposal, "시험이나 발표가 24시간 이내일 때만", "discord:revise", now, expect.any(String));
        expect(result.reply).toContain("다시 확인");
    });
});
//# sourceMappingURL=principle-approval-service.test.js.map