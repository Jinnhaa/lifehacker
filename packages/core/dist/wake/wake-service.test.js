import { FixedClock } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { WakeWorkflowService } from "./wake-service.js";
const userId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-04T00:00:00.000Z"); // 09:00 Asia/Seoul
const emptyContext = { preferredWakeTime: null, preferenceSource: null, firstConstraint: null };
const run = (targetDate, timeZone = "Asia/Seoul") => ({
    id: "wake-run", userId, status: "waiting_for_user", currentStep: "awaiting_time",
    checkpoint: { targetDate, timeZone }, checkpointVersion: 0, correlationId: "correlation"
});
const repository = () => ({
    findWorkflow: vi.fn().mockResolvedValue(null),
    getOrCreateAwaitingWorkflow: vi.fn(async (_userId, targetDate, timeZone) => run(targetDate, timeZone)),
    loadTargetContext: vi.fn().mockResolvedValue(emptyContext),
    schedule: vi.fn(async (workflow, wakeAt, source, messageId) => ({
        ...workflow, status: "running", currentStep: "scheduled",
        checkpoint: { ...workflow.checkpoint, wakeAt: wakeAt.toISOString(), source, lastMessageId: messageId }
    })),
    acknowledgeForDate: vi.fn(),
    snooze: vi.fn().mockResolvedValue(true),
    claimDue: vi.fn().mockResolvedValue(null),
    completeDelivery: vi.fn(),
    failDelivery: vi.fn()
});
const message = (text, receivedAt = now) => ({
    userId, timeZone: "Asia/Seoul", text, messageId: `discord:${text}`, receivedAt
});
describe("WakeWorkflowService", () => {
    it.each([
        ["내일 8시에 깨워줘", "2026-09-05", "2026-09-04T23:00:00.000Z"],
        ["오후 8시에 깨워줘", "2026-09-04", "2026-09-04T11:00:00.000Z"],
        ["내일은 9시에 일어날래", "2026-09-05", "2026-09-05T00:00:00.000Z"]
    ])("sets a wake target for %s", async (text, targetDate, expectedWakeAt) => {
        const repo = repository();
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(now) }).handleWakeMessage(message(text));
        expect(result.handled).toBe(true);
        expect(repo.getOrCreateAwaitingWorkflow).toHaveBeenCalledWith(userId, targetDate, "Asia/Seoul", emptyContext, now);
        expect(vi.mocked(repo.schedule).mock.calls[0]?.[1].toISOString()).toBe(expectedWakeAt);
    });
    it.each([
        ["18:33에 깨워줘", "2026-09-04", "2026-09-04T09:33:00.000Z"],
        ["18시 33분에 깨워줘", "2026-09-04", "2026-09-04T09:33:00.000Z"],
        ["8:30에 깨워줘", "2026-09-04", "2026-09-03T23:30:00.000Z"],
        ["내일 8:30에 깨워줘", "2026-09-05", "2026-09-04T23:30:00.000Z"],
        ["내일 8시 30분에 깨워줘", "2026-09-05", "2026-09-04T23:30:00.000Z"],
        ["오후 6시 30분에 깨워줘", "2026-09-04", "2026-09-04T09:30:00.000Z"],
        ["내일 00:15에 깨워줘", "2026-09-05", "2026-09-04T15:15:00.000Z"],
        ["23:59에 깨워줘", "2026-09-04", "2026-09-04T14:59:00.000Z"],
        ["8시에 깨워줘", "2026-09-04", "2026-09-03T23:00:00.000Z"],
        ["내일 8시에 깨워줘", "2026-09-05", "2026-09-04T23:00:00.000Z"],
        ["오후 8시에 깨워줘", "2026-09-04", "2026-09-04T11:00:00.000Z"],
        ["내일은 9시에 일어날래", "2026-09-05", "2026-09-05T00:00:00.000Z"]
    ])("parses natural minute-level wake time: %s", async (text, targetDate, expectedWakeAt) => {
        const earlyNow = new Date("2026-09-03T15:00:00.000Z"); // 00:00 Asia/Seoul
        const repo = repository();
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(earlyNow) })
            .handleWakeMessage(message(text, earlyNow));
        expect(result.handled).toBe(true);
        expect(repo.getOrCreateAwaitingWorkflow).toHaveBeenCalledWith(userId, targetDate, "Asia/Seoul", emptyContext, earlyNow);
        expect(vi.mocked(repo.schedule).mock.calls[0]?.[1].toISOString()).toBe(expectedWakeAt);
    });
    it.each(["24:00에 깨워줘", "25:90에 깨워줘", "125:30에 깨워줘", "오후 18시 30분에 깨워줘"])("rejects invalid wake time: %s", async (text) => {
        const repo = repository();
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(now) })
            .handleWakeMessage(message(text));
        expect(result).toEqual({ handled: true, reply: "몇 시에 깨울지 시간을 알려줘." });
        expect(repo.schedule).not.toHaveBeenCalled();
    });
    it.each(["8시에 깨워줘", "8:30에 깨워줘"])("does not schedule an already-passed same-day time: %s", async (text) => {
        const repo = repository();
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(now) })
            .handleWakeMessage(message(text));
        expect(result.reply).toContain("이미 지났어");
        expect(repo.schedule).not.toHaveBeenCalled();
    });
    it("accepts a bare time while the Day Close wake checkpoint awaits input", async () => {
        const repo = repository();
        vi.mocked(repo.findWorkflow).mockResolvedValue(run("2026-09-05"));
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(now) })
            .handleWakeMessage(message("8시"));
        expect(result.handled).toBe(true);
        expect(repo.schedule).toHaveBeenCalledOnce();
    });
    it("acknowledges wake state and leaves 일어남 for the Morning Workflow", async () => {
        const repo = repository();
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(now) })
            .handleWakeMessage(message("일어남"));
        expect(result).toEqual({ handled: false });
        expect(repo.acknowledgeForDate).toHaveBeenCalledWith(userId, "2026-09-04", "discord:일어남", now);
    });
    it.each([["10분만", 10], ["20분 뒤에", 20], ["30분 뒤에", 30], ["조금 있다가 깨워줘", 10]])("schedules snooze for %s", async (text, minutes) => {
        const repo = repository();
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(now) })
            .handleWakeMessage(message(text));
        expect(result.reply).toContain(`${minutes}분 뒤`);
        expect(vi.mocked(repo.snooze).mock.calls[0]?.[2].toISOString())
            .toBe(new Date(now.getTime() + minutes * 60_000).toISOString());
    });
    it("asks after Day Close using only the observed first fixed event", async () => {
        const repo = repository();
        vi.mocked(repo.loadTargetContext).mockResolvedValue({
            preferredWakeTime: null, preferenceSource: null,
            firstConstraint: { title: "수업", start: new Date("2026-09-05T01:00:00.000Z") }
        });
        const result = await new WakeWorkflowService({ repository: repo, clock: new FixedClock(now) })
            .afterDayClose(message("오늘 끝"));
        expect(result).toBe("내일 첫 일정은 10:00 수업이야. 몇 시에 깨울까?");
    });
    it("uses an explicit preference without asking again across local midnight", async () => {
        const closeAt = new Date("2026-09-04T15:30:00.000Z"); // 2026-09-05 00:30 KST
        const repo = repository();
        vi.mocked(repo.loadTargetContext).mockResolvedValue({
            preferredWakeTime: "08:00", preferenceSource: "preference", firstConstraint: null
        });
        const service = new WakeWorkflowService({ repository: repo, clock: new FixedClock(closeAt) });
        await service.afterDayClose(message("오늘 끝", closeAt));
        expect(repo.getOrCreateAwaitingWorkflow).toHaveBeenCalledWith(userId, "2026-09-06", "Asia/Seoul", expect.anything(), closeAt);
        expect(vi.mocked(repo.schedule).mock.calls[0]?.[1].toISOString()).toBe("2026-09-05T23:00:00.000Z");
    });
    it("reuses the shared timezone conversion across a DST boundary", async () => {
        const dstNow = new Date("2026-03-07T15:00:00.000Z");
        const repo = repository();
        await new WakeWorkflowService({ repository: repo, clock: new FixedClock(dstNow) }).handleWakeMessage({
            userId, timeZone: "America/New_York", text: "내일 8시에 깨워줘", messageId: "discord:dst", receivedAt: dstNow
        });
        expect(vi.mocked(repo.schedule).mock.calls[0]?.[1].toISOString()).toBe("2026-03-08T12:00:00.000Z");
    });
});
//# sourceMappingURL=wake-service.test.js.map