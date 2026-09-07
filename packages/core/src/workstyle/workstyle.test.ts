import type { UserId } from "@amber/shared";
import { describe, expect, it } from "vitest";
import { DefaultWorkstyleResolver, type WorkstyleProfile, type WorkstyleProfileReader } from "./workstyle.js";

const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const otherUserId = "20000000-0000-4000-8000-000000000002" as UserId;
const profile = (overrides: Partial<WorkstyleProfile>): WorkstyleProfile => ({
  id: "global-1", userId, scopeType: "global", agentType: null, revision: 1,
  instructions: ["global"], directives: { detail: "global", include_reasoning: true }, ...overrides
});

describe("DefaultWorkstyleResolver", () => {
  it("applies agent-specific values over global values and keeps both revisions", async () => {
    const reader: WorkstyleProfileReader = { loadActive: async () => [
      profile({}),
      profile({ id: "pm-2", scopeType: "agent", agentType: "project_pm", revision: 2,
        instructions: ["agent"], directives: { detail: "agent" } })
    ] };
    const result = await new DefaultWorkstyleResolver(reader).resolve({ userId, agentType: "project_pm" });
    expect(result.directives).toMatchObject({ detail: "agent", include_reasoning: true });
    expect(result.instructions).toEqual(["agent", "global"]);
    expect(result.profileRevisions).toEqual([
      { id: "global-1", revision: 1, scopeType: "global" },
      { id: "pm-2", revision: 2, scopeType: "agent" }
    ]);
  });

  it("places the current explicit instruction before stored workstyle", async () => {
    const reader: WorkstyleProfileReader = { loadActive: async () => [profile({})] };
    const result = await new DefaultWorkstyleResolver(reader).resolve({
      userId, agentType: "chief", currentInstruction: "근거는 생략해"
    });
    expect(result.instructions).toEqual(["근거는 생략해", "global"]);
    expect(result.currentInstruction).toBe("근거는 생략해");
  });

  it("rejects a profile owned by another user", async () => {
    const reader: WorkstyleProfileReader = { loadActive: async () => [profile({ userId: otherUserId })] };
    await expect(new DefaultWorkstyleResolver(reader).resolve({ userId, agentType: "chief" }))
      .rejects.toThrow("owner mismatch");
  });

  it("does not expose or depend on Principle fields", async () => {
    const result = await new DefaultWorkstyleResolver().resolve({ userId, agentType: "research" });
    expect(result).not.toHaveProperty("principles");
    expect(result.directives).toEqual({ conclusion_first: true, concise: true });
  });
});

