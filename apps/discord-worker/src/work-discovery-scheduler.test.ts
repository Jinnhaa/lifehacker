import { describe, expect, it, vi } from "vitest";
import { WorkDiscoveryScheduler } from "./work-discovery-scheduler.js";

describe("WorkDiscoveryScheduler", () => {
  it("safely no-ops without an active account", async () => {
    const sync = vi.fn(async () => null);
    await expect(new WorkDiscoveryScheduler({ sync }, 900_000).runOnce()).resolves.toBe("no_active_account");
  });
  it("contains provider failures without breaking the worker", async () => {
    const sync = vi.fn(async () => { throw new Error("unavailable"); });
    await expect(new WorkDiscoveryScheduler({ sync }, 900_000).runOnce()).resolves.toBe("failed");
  });
});
