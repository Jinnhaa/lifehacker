import { FixedClock, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { formatWakeMessage, WakeScheduler } from "./wake-scheduler.js";

const now = new Date("2026-09-05T00:00:00.000Z");
const claim = {
  jobId: "job", notificationId: "notification",
  userId: "10000000-0000-4000-8000-000000000001" as UserId,
  discordUserId: "123456789012345678", wakeAt: now, timeZone: "Asia/Seoul",
  firstConstraintTitle: "수업", firstConstraintAt: new Date("2026-09-05T01:00:00.000Z")
};

describe("WakeScheduler", () => {
  it("sends a claimed due notification once and marks it complete", async () => {
    const repository = {
      claimDue: vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce(null),
      completeDelivery: vi.fn(), failDelivery: vi.fn()
    };
    const delivery = { send: vi.fn() };
    const count = await new WakeScheduler(repository, delivery, new FixedClock(now), 30_000).runOnce();
    expect(count).toBe(1);
    expect(delivery.send).toHaveBeenCalledWith(claim.discordUserId, formatWakeMessage(claim));
    expect(repository.completeDelivery).toHaveBeenCalledWith(claim, now);
  });

  it("keeps a failed delivery retryable instead of marking it sent", async () => {
    const repository = {
      claimDue: vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce(null),
      completeDelivery: vi.fn(), failDelivery: vi.fn()
    };
    const delivery = { send: vi.fn().mockRejectedValue(new Error("network")) };
    await new WakeScheduler(repository, delivery, new FixedClock(now), 30_000).runOnce();
    expect(repository.completeDelivery).not.toHaveBeenCalled();
    expect(repository.failDelivery).toHaveBeenCalledWith(claim, "network", now);
  });

  it("does not send before a repository exposes a due claim", async () => {
    const repository = { claimDue: vi.fn().mockResolvedValue(null), completeDelivery: vi.fn(), failDelivery: vi.fn() };
    const delivery = { send: vi.fn() };
    expect(await new WakeScheduler(repository, delivery, new FixedClock(now), 30_000).runOnce()).toBe(0);
    expect(delivery.send).not.toHaveBeenCalled();
  });
});
