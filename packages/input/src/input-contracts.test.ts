import { describe, expect, it } from "vitest";
import { ProviderAIInterpreter } from "./ai-interpreter.js";
import { manualTextInputSchema, parseResultSchema } from "./contracts.js";
import { applyExplicitTaskFacts, extractExplicitTaskFacts } from "./deterministic-facts.js";
import { DeterministicTestInterpreter } from "./deterministic-interpreter.js";

describe("structured input contracts", () => {
  it("accepts the canonical ManualTextInput", () => {
    expect(manualTextInputSchema.parse({
      userId: "20000000-0000-4000-8000-000000000001",
      text: "보고서 작성",
      receivedAt: "2026-09-03T10:00:00+09:00",
      source: "manual",
      clientRequestId: "request-1"
    }).source).toBe("manual");
  });

  it("rejects malformed structured output at the provider adapter boundary", async () => {
    const interpreter = new ProviderAIInterpreter({ generateStructuredOutput: async () => ({ intent: "CREATE_TASK" }) });
    await expect(interpreter.parseInput({ text: "task", receivedAt: "2026-09-03T10:00:00+09:00", timeZone: "Asia/Seoul", source: "manual" }))
      .rejects.toMatchObject({ name: "ZodError" });
  });

  it("provides a deterministic task interpreter without a provider SDK", async () => {
    const result = await new DeterministicTestInterpreter().parseInput({
      text: "자료 정리", receivedAt: "2026-09-03T10:00:00+09:00", timeZone: "Asia/Seoul", source: "manual"
    });
    expect(parseResultSchema.parse(result).entities[0]?.data).toEqual({ title: "자료 정리", inferredFields: [] });
  });
});

describe("deterministic explicit facts", () => {
  it("interprets relative dates in the user timezone", () => {
    const facts = extractExplicitTaskFacts("내일 보고서 45분 중요도 5", new Date("2026-09-03T14:30:00.000Z"), "Asia/Seoul");
    expect(facts).toEqual({ officialDeadline: "2026-09-04T14:59:59.000Z", estimatedMinutes: 45, importance: 5 });
  });

  it("prevents an AI-inferred deadline from overwriting an explicit deadline", () => {
    const result = applyExplicitTaskFacts(
      { title: "보고서", officialDeadline: "2027-01-01T00:00:00.000Z", inferredFields: ["officialDeadline"] },
      { title: "user_explicit", officialDeadline: "ai_inferred" },
      { officialDeadline: "2026-09-04T14:59:59.000Z" }
    );
    expect(result.draft.officialDeadline).toBe("2026-09-04T14:59:59.000Z");
    expect(result.draft.inferredFields).not.toContain("officialDeadline");
    expect(result.provenance.officialDeadline).toBe("user_explicit");
  });
});
