import { FixedClock } from "@amber/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateDayCloseResult, DayCloseService } from "./day-close-service.js";
const userId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-04T14:00:00.000Z");
const observation = {
    planId: "plan",
    planItems: [
        { itemType: "task", status: "completed", plannedMinutes: 30, taskId: "done", taskStatus: "DONE", recurringActivityId: null, recurringTitle: null, occurrenceStatus: null },
        { itemType: "task", status: "blocked", plannedMinutes: 60, taskId: "blocked", taskStatus: "BLOCKED", recurringActivityId: null, recurringTitle: null, occurrenceStatus: null },
        { itemType: "routine", status: "planned", plannedMinutes: 30, taskId: null, taskStatus: null, recurringActivityId: "routine", recurringTitle: "일본어", occurrenceStatus: "planned" }
    ],
    completedTaskIds: ["done"],
    blockedTaskIds: ["blocked"],
    actualFocusMinutes: 70,
    replanCount: 2,
    recurringActivityStatus: [{ recurringActivityId: "routine", title: "일본어", status: "planned", completed: false }],
    taskOutcomes: [
        { taskId: "done", title: "완료 과제", status: "DONE", estimatedMinutes: 30, actualMinutes: 40, deltaMinutes: 10 },
        { taskId: "blocked", title: "막힌 과제", status: "BLOCKED", estimatedMinutes: 60, actualMinutes: 30, deltaMinutes: -30 }
    ]
};
describe("Day Close deterministic aggregation", () => {
    it("calculates plan/actual, blocked, recurring, and carryover facts without AI", () => {
        const result = calculateDayCloseResult(observation, "2026-09-04", now);
        expect(result).toMatchObject({
            plannedItemCount: 3, completedItemCount: 1, incompleteItemCount: 2,
            plannedMinutes: 120, actualMinutes: 70, varianceMinutes: -50, replanCount: 2,
            completedTaskIds: ["done"], incompleteTaskIds: ["blocked"], blockedTaskIds: ["blocked"],
            carryoverTaskIds: ["blocked"]
        });
        expect(result.taskOutcomes[0]).toMatchObject({ estimatedMinutes: 30, actualMinutes: 40, deltaMinutes: 10 });
    });
    it("supports a no-plan day", () => {
        const result = calculateDayCloseResult({ ...observation, planId: null, planItems: [] }, "2026-09-04", now);
        expect(result).toMatchObject({ plannedItemCount: 0, plannedMinutes: 0, actualMinutes: 70 });
    });
});
describe("DayCloseService", () => {
    let repository;
    let run;
    beforeEach(() => {
        run = {
            id: "workflow", userId, status: "running", currentStep: "observe",
            checkpoint: { date: "2026-09-04", timeZone: "Asia/Seoul" }, checkpointVersion: 0, correlationId: "correlation"
        };
        repository = {
            getOrCreateWorkflow: vi.fn().mockResolvedValue(run),
            findWorkflow: vi.fn().mockResolvedValue(null),
            hasActiveFocus: vi.fn().mockResolvedValue(false),
            awaitFocusConfirmation: vi.fn().mockResolvedValue({ ...run, status: "waiting_for_user", currentStep: "awaiting_focus_confirmation" }),
            closeActiveFocus: vi.fn(),
            loadObservation: vi.fn().mockResolvedValue(observation),
            complete: vi.fn().mockImplementation(async (_run, result) => ({ result, duplicate: false }))
        };
    });
    const service = () => new DayCloseService({ repository, clock: new FixedClock(now) });
    const message = (text, messageId = "discord:close") => ({
        userId, timeZone: "Asia/Seoul", text, messageId, receivedAt: now
    });
    it.each(["오늘 끝", "오늘은 끝", "잘게", "이제 잘게"])("handles %s without task input", async (text) => {
        const result = await service().handleDayCloseMessage(message(text));
        expect(result.handled).toBe(true);
        expect(result.reply).toContain("오늘은 여기까지 정리했어");
    });
    it("guards an active Focus and closes it only after confirmation", async () => {
        vi.mocked(repository.hasActiveFocus).mockResolvedValue(true);
        const instance = service();
        const first = await instance.handleDayCloseMessage(message("오늘 끝"));
        expect(first.reply).toContain("진행 중인 작업");
        expect(repository.closeActiveFocus).not.toHaveBeenCalled();
        vi.mocked(repository.findWorkflow).mockResolvedValue({
            ...run, status: "waiting_for_user", currentStep: "awaiting_focus_confirmation",
            checkpoint: { ...run.checkpoint, lastMessageId: "discord:close" }, checkpointVersion: 1
        });
        const duplicate = await instance.handleDayCloseMessage(message("오늘 끝"));
        expect(duplicate.reply).toBe(first.reply);
        expect(repository.closeActiveFocus).not.toHaveBeenCalled();
        const confirmed = await instance.handleDayCloseMessage(message("응", "discord:confirm"));
        expect(confirmed.reply).toContain("오늘은 여기까지 정리했어");
        expect(repository.closeActiveFocus).toHaveBeenCalledOnce();
    });
    it("reuses the completed result for same-day retries", async () => {
        const result = calculateDayCloseResult(observation, "2026-09-04", now);
        vi.mocked(repository.findWorkflow).mockResolvedValue({
            ...run, status: "completed", currentStep: "completed", checkpoint: { ...run.checkpoint, result }
        });
        const response = await service().handleDayCloseMessage(message("오늘 끝", "discord:retry"));
        expect(response.reply).toContain("완료 1개 · 미완료 2개");
        expect(repository.complete).not.toHaveBeenCalled();
    });
    it("does not intercept ordinary input after the day is closed", async () => {
        const result = calculateDayCloseResult(observation, "2026-09-04", now);
        vi.mocked(repository.findWorkflow).mockResolvedValue({
            ...run, status: "completed", currentStep: "completed", checkpoint: { ...run.checkpoint, result, lastMessageId: "discord:close" }
        });
        await expect(service().handleDayCloseMessage(message("새 과제 기록", "discord:ordinary"))).resolves.toEqual({ handled: false });
    });
    it("completes Day Close before adding a non-blocking Wake follow-up", async () => {
        const wakeFollowUp = { afterDayClose: vi.fn().mockResolvedValue("내일 몇 시에 깨울까?") };
        const instance = new DayCloseService({ repository, clock: new FixedClock(now), wakeFollowUp });
        const response = await instance.handleDayCloseMessage(message("오늘 끝"));
        expect(repository.complete).toHaveBeenCalledOnce();
        expect(response.reply).toContain("오늘은 여기까지 정리했어");
        expect(response.reply).toContain("내일 몇 시에 깨울까?");
    });
    it("keeps Day Close completed when the optional Wake follow-up fails", async () => {
        const wakeFollowUp = { afterDayClose: vi.fn().mockRejectedValue(new Error("wake unavailable")) };
        const instance = new DayCloseService({ repository, clock: new FixedClock(now), wakeFollowUp });
        const response = await instance.handleDayCloseMessage(message("오늘 끝"));
        expect(repository.complete).toHaveBeenCalledOnce();
        expect(response.reply).toContain("오늘은 여기까지 정리했어");
    });
    it("collects learning cases only after Day Close produces an outcome", async () => {
        const decisionLearning = {
            collectDayCloseOutcomes: vi.fn().mockResolvedValue(1),
            handleReasonMessage: vi.fn().mockResolvedValue({ handled: false })
        };
        const instance = new DayCloseService({ repository, clock: new FixedClock(now), decisionLearning });
        await instance.handleDayCloseMessage(message("오늘 끝"));
        expect(repository.complete).toHaveBeenCalledOnce();
        expect(decisionLearning.collectDayCloseOutcomes).toHaveBeenCalledWith(expect.objectContaining({
            userId, date: "2026-09-04", timeZone: "Asia/Seoul"
        }));
    });
    it("stores a pending decision reason without reopening Day Close", async () => {
        const decisionLearning = {
            collectDayCloseOutcomes: vi.fn(),
            handleReasonMessage: vi.fn().mockResolvedValue({ handled: true, reply: "이유를 저장했어." })
        };
        const instance = new DayCloseService({ repository, clock: new FixedClock(now), decisionLearning });
        const response = await instance.handleDayCloseMessage(message("이유는 마감이 더 중요해서", "discord:reason"));
        expect(response).toEqual({ handled: true, reply: "이유를 저장했어." });
        expect(repository.findWorkflow).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=day-close-service.test.js.map