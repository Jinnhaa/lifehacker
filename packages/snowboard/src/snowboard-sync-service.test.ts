import type { DiscoveredWorkItem } from "@amber/input";
import type { UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { SnowboardSyncService } from "./snowboard-sync-service.js";

const item: DiscoveredWorkItem = {
  source: "snowboard",
  sourceItemId: "9001",
  sourceVersion: "v1",
  sourceUrl: null,
  observedAt: new Date("2026-09-14T00:00:00Z"),
  title: "Database Report",
  officialDeadline: new Date("2026-09-22T14:59:00Z"),
  workContextHint: "Database Systems",
  objectiveHint: null,
  status: "open",
  taskSemantics: "clear",
  rawPayload: { courseId: "101" }
};

describe("SnowboardSyncService", () => {
  it("routes normalized assignments through the shared work-item intake", async () => {
    const listAssignments = vi.fn(async () => [item]);
    const processDiscoveredWorkItem = vi.fn(async () => ({ status: "materialized" }));
    const service = new SnowboardSyncService({ listAssignments }, { processDiscoveredWorkItem });
    const result = await service.sync("10000000-0000-4000-8000-000000000001" as UserId, {
      ...configForTest()
    });

    expect(result).toEqual({ received: 1, assignments: 1, quizzes: 0, completionSignals: 0, materialized: 1, needsConfirmation: 0, dismissed: 0 });
    expect(processDiscoveredWorkItem).toHaveBeenCalledWith(expect.any(String), item);
  });
});

function configForTest() {
  return {
    baseUrl: "https://snowboard.sookmyung.ac.kr/",
    currentTerm: "2026-2",
    regularCourseIds: ["101"],
    username: "student",
    password: "secret",
    pythonBin: "python3"
  };
}
