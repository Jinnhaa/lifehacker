import { FixedClock } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { MorningWorkflowService } from "./morning-service.js";
const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const now = new Date("2026-09-04T00:00:00.000Z");
const observation = {
    timeZone: "Asia/Seoul", planningBufferMinutes: 15, planningPolicy: {}, constraints: [], strategicDirectives: [],
    recurringActivities: [],
    tasks: [{
            id: "20000000-0000-4000-8000-000000000001", userId, workContextId: null, objectiveId: null,
            title: "운영체제 과제", description: null, executionMode: "standard", officialDeadline: new Date("2026-09-04T14:59:59.000Z"),
            internalDeadline: null, estimatedMinutes: 30, estimatedUserMinutes: null, actualMinutes: 0, importance: 4,
            status: "INBOX", nextAction: null, completionCriteria: null, completionSource: null,
            createdAt: now, completedAt: null, updatedAt: now
        }]
};
class FakeMorningRepository {
    runs = new Map();
    plans = [];
    createCount = 0;
    eventCount = 0;
    observationLoads = 0;
    async getOrCreateWorkflow(requestUserId, planDate, timeZone) {
        const key = `${requestUserId}:${planDate}`;
        const existing = this.runs.get(key);
        if (existing)
            return existing;
        this.createCount += 1;
        const run = {
            id: `run-${this.createCount}`, userId: requestUserId, status: "running", currentStep: "observe",
            checkpoint: { planDate, timeZone }, checkpointVersion: 0, correlationId: `correlation-${this.createCount}`
        };
        this.runs.set(key, run);
        return run;
    }
    async findTodayWorkflow(requestUserId, planDate) {
        return this.runs.get(`${requestUserId}:${planDate}`) ?? null;
    }
    async loadObservation() {
        this.observationLoads += 1;
        return observation;
    }
    async updateCheckpoint(run, checkpoint, step, status) {
        const updated = { ...run, checkpoint, currentStep: step, status, checkpointVersion: run.checkpointVersion + 1 };
        this.runs.set(`${run.userId}:${run.checkpoint.planDate}`, updated);
        return updated;
    }
    async createProposal(run, draft) {
        const current = await this.findTodayWorkflow(run.userId, run.checkpoint.planDate);
        if (current?.currentStep === "awaiting_approval")
            return this.plans.at(-1);
        const plan = {
            id: `plan-${this.plans.length + 1}`, revisionNo: this.plans.length + 1, status: "pending_approval",
            items: draft.items, fixedEvents: draft.fixedEvents, highlights: draft.highlights
        };
        this.plans.push(plan);
        this.eventCount += 1;
        await this.updateCheckpoint(run, { ...run.checkpoint, planId: plan.id }, "awaiting_approval", "waiting_for_user");
        return plan;
    }
    async getProposal() { return this.plans.at(-1) ?? null; }
    async approve(run) {
        const plan = this.plans.at(-1);
        const duplicate = plan.status === "approved";
        if (!duplicate) {
            this.plans[this.plans.length - 1] = { ...plan, status: "approved" };
            this.eventCount += 1;
            await this.updateCheckpoint(run, run.checkpoint, "completed", "completed");
        }
        return { plan: this.plans.at(-1), duplicate };
    }
    async deriveCurrentAction(requestUserId) {
        return requestUserId === userId ? { title: "운영체제 과제", source: "plan_item" } : null;
    }
}
const message = (text, requestUserId = userId, id = text) => ({
    userId: requestUserId, timeZone: "Asia/Seoul", text, messageId: id, receivedAt: now
});
describe("MorningWorkflowService", () => {
    it("asks only for missing hidden context, resumes one workflow, proposes, and approves idempotently", async () => {
        const repository = new FakeMorningRepository();
        const service = new MorningWorkflowService({ repository, clock: new FixedClock(now) });
        const first = await service.handleMorningMessage(message("일어남", userId, "wake-1"));
        const resumed = await service.handleMorningMessage(message("일어남", userId, "wake-2"));
        expect(first.reply).toContain("몇 시까지");
        expect(resumed.reply).toBe(first.reply);
        expect(repository.createCount).toBe(1);
        expect(repository.plans).toHaveLength(0);
        const proposal = await service.handleMorningMessage(message("오후 6시까지, 3시부터 4시 개인 일정", userId, "context-1"));
        expect(proposal.reply).toContain("운영체제 과제");
        expect(repository.plans).toHaveLength(1);
        expect(repository.plans[0]?.items.every((item) => item.end <= new Date("2026-09-04T09:00:00.000Z"))).toBe(true);
        expect(repository.plans[0]?.items.every((item) => item.end <= new Date("2026-09-04T06:00:00.000Z") || item.start >= new Date("2026-09-04T07:00:00.000Z"))).toBe(true);
        const approved = await service.handleMorningMessage(message("승인", userId, "approve-1"));
        const duplicate = await service.handleMorningMessage(message("승인", userId, "approve-1"));
        expect(approved.reply).toContain("첫 할 일은 운영체제 과제");
        expect(duplicate.reply).toBe(approved.reply);
        expect(repository.eventCount).toBe(2);
    });
    it("creates a new immutable revision for a modification and isolates users", async () => {
        const repository = new FakeMorningRepository();
        const decisionLearning = { recordMaterialDecision: vi.fn().mockResolvedValue("왜 바꾸고 싶어?") };
        const service = new MorningWorkflowService({ repository, clock: new FixedClock(now), decisionLearning });
        await service.handleMorningMessage(message("일어남"));
        await service.handleMorningMessage(message("오후 6시까지", userId, "context"));
        const firstPlan = repository.plans[0];
        const firstItems = [...firstPlan.items];
        const revised = await service.handleMorningMessage(message("수정: 운영체제 과제 제외", userId, "revision"));
        expect(repository.plans).toHaveLength(2);
        expect(repository.plans[0]).toBe(firstPlan);
        expect(repository.plans[0]?.items).toEqual(firstItems);
        expect(repository.plans[1]?.items.some((item) => item.title === "운영체제 과제")).toBe(false);
        expect(revised.reply).toContain("왜 바꾸고 싶어?");
        expect(decisionLearning.recordMaterialDecision).toHaveBeenCalledOnce();
        expect(await service.handleMorningMessage(message("승인", otherUserId))).toEqual({ handled: false });
        expect(repository.runs.has(`${otherUserId}:2026-09-04`)).toBe(false);
    });
    it("does not record a minor Morning adjustment", async () => {
        const repository = new FakeMorningRepository();
        repository.loadObservation = async () => ({
            ...observation,
            tasks: [{ ...observation.tasks[0], importance: 2, officialDeadline: null }]
        });
        const decisionLearning = { recordMaterialDecision: vi.fn() };
        const service = new MorningWorkflowService({ repository, clock: new FixedClock(now), decisionLearning });
        await service.handleMorningMessage(message("일어남"));
        await service.handleMorningMessage(message("오후 6시까지", userId, "context-minor"));
        await service.handleMorningMessage(message("수정: 운영체제 과제 제외", userId, "revision-minor"));
        expect(decisionLearning.recordMaterialDecision).not.toHaveBeenCalled();
    });
    it("uses a known default work-until without asking it again", async () => {
        const repository = new FakeMorningRepository();
        repository.loadObservation = async () => ({ ...observation, planningPolicy: { defaultWorkUntil: "18:00" } });
        const service = new MorningWorkflowService({ repository, clock: new FixedClock(now) });
        const result = await service.handleMorningMessage(message("일어남"));
        expect(result.reply).toContain("오늘은 이렇게");
        expect(result.reply).not.toContain("몇 시까지");
    });
});
//# sourceMappingURL=morning-service.test.js.map