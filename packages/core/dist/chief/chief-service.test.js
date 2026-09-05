import { FixedClock } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { ChiefAgentService, isChiefRequest } from "./chief-service.js";
const userId = "20000000-0000-4000-8000-000000000001";
const otherUserId = "20000000-0000-4000-8000-000000000002";
const now = new Date("2026-09-05T03:00:00.000Z");
const task = (overrides = {}) => ({
    id: "30000000-0000-4000-8000-000000000001",
    userId,
    workContextId: null,
    objectiveId: null,
    title: "운영체제 과제",
    description: null,
    executionMode: "standard",
    officialDeadline: new Date("2026-09-05T13:00:00.000Z"),
    internalDeadline: null,
    estimatedMinutes: 45,
    estimatedUserMinutes: null,
    actualMinutes: 0,
    importance: 4,
    status: "PLANNED",
    nextAction: null,
    completionCriteria: null,
    completionSource: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    completedAt: null,
    updatedAt: now,
    ...overrides
});
const observation = (overrides = {}) => ({
    timeZone: "Asia/Seoul",
    planningBufferMinutes: 10,
    planningPolicy: {},
    constraints: [{
            id: "constraint-1", title: "수업", blocksCapacity: true, constraintType: "calendar_event",
            hardness: "fixed", origin: "calendar", start: new Date("2026-09-05T01:00:00.000Z"), end: new Date("2026-09-05T02:00:00.000Z")
        }],
    tasks: [task(), task({ id: "30000000-0000-4000-8000-000000000002", title: "막힌 과제", status: "BLOCKED" })],
    recurringActivities: [],
    strategicDirectives: [],
    principles: [],
    carryoverContext: { sourceDate: "2026-09-04", taskIds: [], blockedTaskIds: [] },
    ...overrides
});
const context = (overrides = {}) => ({
    userId,
    observedAt: now,
    planDate: "2026-09-05",
    timeZone: "Asia/Seoul",
    observation: observation(),
    approvedPlan: { id: "plan-1", revisionNo: 1 },
    currentAction: null,
    activeFocus: null,
    replannedToday: false,
    weekStartsOn: 1,
    ...overrides
});
const message = (text, id = "discord:message-1", requestedUserId = userId) => ({
    userId: requestedUserId,
    timeZone: "Asia/Seoul",
    text,
    messageId: id,
    receivedAt: now
});
const serviceWith = (loaded, recorder) => {
    const reader = { loadChiefContext: vi.fn(async () => loaded) };
    return {
        service: new ChiefAgentService({ contextReader: reader, clock: new FixedClock(now), ...(recorder ? { runRecorder: recorder } : {}) }),
        reader
    };
};
describe("ChiefAgentService", () => {
    it.each(["오늘 상황 봐줘", "오늘 뭐 해야 돼?", "지금 뭐 해야 해?", "현황 알려줘", "뭐부터 할까?"])("handles the explicit Chief request %s", async (text) => {
        const { service } = serviceWith(context());
        expect((await service.handleChiefMessage(message(text))).handled).toBe(true);
    });
    it("handles status requests with deterministic Calendar and Task facts", async () => {
        const { service } = serviceWith(context({ replannedToday: true }));
        const result = await service.handleChiefMessage(message("오늘 상황 봐줘"));
        expect(result.handled).toBe(true);
        expect(result.reply).toContain("고정 일정 1개");
        expect(result.reply).toContain("남은 할 일 2개");
        expect(result.reply).toContain("마감 임박 2개");
        expect(result.reply).toContain("막힌 일 1개");
        expect(result.reply).toContain("오늘 일정 조정됨");
        expect(result.reply).not.toContain("score");
    });
    it("uses the derived Current Action without recommending another Task", async () => {
        const loaded = context({
            currentAction: { kind: "task", source: "focus_session", title: "데이터구조 복습", taskId: "current-task", planItemId: null }
        });
        const { service } = serviceWith(loaded);
        const result = await service.handleChiefMessage(message("지금 뭐 해야 해?"));
        expect(result.reply).toContain("데이터구조 복습");
        expect(result.reply).not.toContain("지금 할 일\n운영체제 과제");
    });
    it("uses an approved planning preference only when it changes an ambiguous priority", async () => {
        const recorder = {
            findCompleted: vi.fn(async () => null),
            recordCompleted: vi.fn(async () => undefined)
        };
        const loaded = context({ observation: observation({
                tasks: [task({ importance: 3 })],
                recurringActivities: [{
                        id: "routine-1", title: "장기 루틴", targetCount: 3, completedCount: 0, expectedMinutes: 30,
                        minimumMinutes: null, preferredDays: [5, 6, 7], importance: 5, occurrenceId: null
                    }],
                principles: [{
                        id: "principle-1", statement: "마감 우선", origin: "pattern_observed", decisionType: "priority",
                        situationType: "deadline", choiceAction: "prioritize", consistencyKind: "outcome", consistencyValue: "done",
                        applicationPolicy: "deadline_over_routine"
                    }]
            }) });
        const { service } = serviceWith(loaded, recorder);
        const result = await service.handleChiefMessage(message("뭐부터 할까?"));
        expect(result.reply).toContain("운영체제 과제");
        expect(result.reply).toContain("이전에 승인한 기준대로");
        expect(recorder.recordCompleted).toHaveBeenCalledWith(expect.objectContaining({ usedPrincipleIds: ["principle-1"] }));
    });
    it("keeps user identity scoped through the context read", async () => {
        const { service, reader } = serviceWith(context({ userId: otherUserId }));
        await service.handleChiefMessage(message("현황 알려줘", "discord:other", otherUserId));
        expect(reader.loadChiefContext).toHaveBeenCalledWith(otherUserId, "2026-09-05", "Asia/Seoul", now);
    });
    it("rejects a context returned for another user", async () => {
        const { service } = serviceWith(context({ userId: otherUserId }));
        await expect(service.handleChiefMessage(message("현황 알려줘"))).rejects.toThrow("owner mismatch");
    });
    it("returns a recorded reply on retry without observing again", async () => {
        const recorder = {
            findCompleted: vi.fn(async () => ({ reply: "기존 응답" })),
            recordCompleted: vi.fn(async () => undefined)
        };
        const { service, reader } = serviceWith(context(), recorder);
        await expect(service.handleChiefMessage(message("현황 알려줘"))).resolves.toEqual({ handled: true, reply: "기존 응답" });
        expect(reader.loadChiefContext).not.toHaveBeenCalled();
        expect(recorder.recordCompleted).not.toHaveBeenCalled();
    });
    it.each(["일어남", "시작", "완료", "막혔어", "다시 짜줘", "오늘 끝", "내일 8시에 깨워줘", "내일까지 과제 해야 해"])("does not intercept %s", async (text) => {
        const { service, reader } = serviceWith(context());
        await expect(service.handleChiefMessage(message(text))).resolves.toEqual({ handled: false });
        expect(reader.loadChiefContext).not.toHaveBeenCalled();
        expect(isChiefRequest(text)).toBe(false);
    });
});
//# sourceMappingURL=chief-service.test.js.map