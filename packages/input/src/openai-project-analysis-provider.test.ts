import type { BacklogRefinementInput, ProjectStateReviewInput } from "@amber/core";
import { projectStateSnapshotSchema } from "@amber/core";
import type { UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPENAI_PROJECT_ANALYSIS_MODEL,
  loadOpenAIProjectAnalysisConfig,
  OpenAIProjectAnalysisProvider,
  type ProjectAnalysisResponseRequest,
  type ProjectAnalysisResponsesClient
} from "./openai-project-analysis-provider.js";

const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const snapshot = projectStateSnapshotSchema.parse({
  schemaVersion: "1", workContextId: "project-1", generatedAt: "2026-09-09T03:00:00.000Z",
  project: { id: "project-1", title: "LogFolio", description: null, status: "active", startDate: null, endDate: null },
  primaryObjectiveId: "objective-1",
  objectives: [{ id: "objective-1", goalId: null, title: "출시", targetDate: null, successCriteria: "검증", importance: 5, status: "active" }],
  goals: [], tasks: [], artifacts: [], decisions: [], recentEvents: [],
  sourceRefs: [{ ref: "objective:objective-1", kind: "objective", freshness: "current", observedAt: "2026-09-09T03:00:00.000Z", contentHash: null }],
  blockers: [], unresolved: []
});
const config = { apiKey: "test", model: DEFAULT_OPENAI_PROJECT_ANALYSIS_MODEL, reasoningEffort: "medium" as const, timeoutMs: 45_000, maxRetries: 0 as const };

describe("OpenAIProjectAnalysisProvider", () => {
  it("uses the project model configuration and does not send the user id", async () => {
    expect(loadOpenAIProjectAnalysisConfig({ OPENAI_API_KEY: "key" }).model).toBe("gpt-5.6-sol");
    const requests: ProjectAnalysisResponseRequest[] = [];
    const client: ProjectAnalysisResponsesClient = { parse: vi.fn(async (request) => {
      requests.push(request);
      return { status: "completed" as const, output_parsed: { gaps: [], unknowns: [] }, output: [] };
    }) };
    const provider = new OpenAIProjectAnalysisProvider({ config, client });
    const input: ProjectStateReviewInput = { userId, workflowRunId: "workflow-1", snapshot };
    await expect(provider.reviewProjectState(input)).resolves.toEqual({ gaps: [], unknowns: [] });
    expect(requests[0]).toMatchObject({ model: "gpt-5.6-sol", reasoning: { effort: "medium" }, store: false });
    expect(requests[0]?.input).not.toContain(userId);
    expect(requests[0]?.instructions).toContain("sourceRefs만 근거");
  });

  it("validates backlog-refinement output before returning it", async () => {
    const client: ProjectAnalysisResponsesClient = { parse: vi.fn(async () => ({
      status: "completed" as const,
      output_parsed: { items: [{
        key: "item-1", sourceGapKey: "gap-1", objectiveId: "objective-1", title: "기준 작성", description: "기준을 작성한다",
        suggestedPriority: "high", suggestedOwner: "ai", acceptanceCriteria: ["기준 존재"], dependencies: [], roughSize: "s",
        evidenceRefs: ["gap:gap-1"], risk: null
      }], unknowns: [] },
      output: []
    })) };
    const provider = new OpenAIProjectAnalysisProvider({ config, client });
    const input: BacklogRefinementInput = {
      userId, workflowRunId: "workflow-1", snapshot, constraints: [],
      gapAnalysis: {
        schemaVersion: "1", workContextId: "project-1", objectiveId: "objective-1", sourceSnapshotArtifactId: "snapshot-1",
        sourceRefs: ["objective:objective-1"], generatedAt: "2026-09-09T03:00:00.000Z", unknowns: [],
        gaps: [{ key: "gap-1", title: "기준 부족", description: "기준 부족", evidenceRefs: ["objective:objective-1"], priorityHint: "high", confidence: 0.9, blocking: true, rationale: "완료 판정 불가" }]
      }
    };
    await expect(provider.refineBacklog(input)).resolves.toMatchObject({ items: [{ suggestedOwner: "ai" }] });
  });

  it("rejects malformed structured output", async () => {
    const client: ProjectAnalysisResponsesClient = { parse: vi.fn(async () => ({
      status: "completed" as const, output_parsed: { gaps: [{ key: "missing-fields" }] }, output: []
    })) };
    const provider = new OpenAIProjectAnalysisProvider({ config, client });
    await expect(provider.reviewProjectState({ userId, workflowRunId: "workflow-1", snapshot }))
      .rejects.toMatchObject({ code: "PARSE_INVALID" });
  });
});
