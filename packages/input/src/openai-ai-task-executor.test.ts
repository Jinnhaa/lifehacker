import { FixedClock, type UserId } from "@amber/shared";
import type { DocumentDraftInput } from "@amber/core";
import { describe, expect, it, vi } from "vitest";
import { OpenAIAiTaskExecutor, type ProjectAnalysisResponsesClient } from "./index.js";

const input: DocumentDraftInput = {
  userId: "10000000-0000-4000-8000-000000000001" as UserId,
  workflowRunId: "20000000-0000-4000-8000-000000000001",
  agentRunId: "30000000-0000-4000-8000-000000000001",
  contextPackageId: "40000000-0000-4000-8000-000000000001",
  workContext: { id: "50000000-0000-4000-8000-000000000001", title: "Project", description: null },
  objective: null,
  task: { id: "60000000-0000-4000-8000-000000000001", title: "Draft", description: null, completionCriteria: "done" },
  taskStep: { id: "70000000-0000-4000-8000-000000000001", title: "Draft", completionCriteria: "done" },
  acceptedArtifacts: [], decisions: [], sourceRefs: ["task_step:70000000-0000-4000-8000-000000000001"],
  executionConstraints: ["read-only project scope"]
};

describe("OpenAI AI Task executor", () => {
  it("uses Responses structured output and records the AgentRun-linked AIExecution", async () => {
    const client: ProjectAnalysisResponsesClient = { parse: vi.fn(async () => ({
      status: "completed" as const, output: [], output_parsed: {
        title: "Draft", summary: "Summary", body: "Body", addressedCriteria: ["done"],
        sourceRefs: input.sourceRefs, uncertainties: []
      }, usage: { input_tokens: 10, output_tokens: 20 }
    })) };
    const recorder = { record: vi.fn(async () => undefined) };
    const executor = new OpenAIAiTaskExecutor({
      config: { apiKey: "test", model: "test-model", reasoningEffort: "medium", timeoutMs: 1, maxRetries: 0 },
      client, executionRecorder: recorder,
      clock: new FixedClock(new Date("2026-09-09T06:00:00.000Z"))
    });
    await expect(executor.executeDocumentDraft(input)).resolves.toMatchObject({ title: "Draft" });
    expect(client.parse).toHaveBeenCalledOnce();
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "document_draft", workflowRunId: input.workflowRunId, agentRunId: input.agentRunId, status: "completed"
    }));
  });
});
