import type { DiscoveredWorkItem } from "@amber/input";
import type { UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { NotionSyncService } from "./notion-sync-service.js";

const item: DiscoveredWorkItem = { source: "notion", sourceItemId: "page", sourceVersion: "v1", sourceUrl: null, observedAt: new Date(), title: "업무", officialDeadline: null, workContextHint: null, objectiveHint: null, status: "open", taskSemantics: "clear", rawPayload: {} };

describe("NotionSyncService", () => {
  it("reads every explicit source and passes candidates to the shared intake", async () => {
    const listWorkItems = vi.fn(async () => [item]);
    const processDiscoveredWorkItem = vi.fn(async () => ({ status: "materialized" }));
    const markSynced = vi.fn(async () => undefined);
    const service = new NotionSyncService({ listWorkItems }, { markSynced } as never, { processDiscoveredWorkItem });
    await expect(service.sync({ id: "account", userId: "10000000-0000-4000-8000-000000000001" as UserId, secretRef: "env:NOTION_API_TOKEN", sourceIds: ["a", "b"] })).resolves.toMatchObject({ received: 2, materialized: 2 });
    expect(listWorkItems).toHaveBeenCalledTimes(2);
    expect(markSynced).toHaveBeenCalledOnce();
  });
});
