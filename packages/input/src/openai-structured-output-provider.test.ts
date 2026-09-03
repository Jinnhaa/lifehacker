import { APIConnectionError, APIConnectionTimeoutError } from "openai";
import { describe, expect, it, vi } from "vitest";
import type { UserId } from "@amber/shared";
import {
  DEFAULT_OPENAI_INPUT_MODEL,
  loadOpenAIInputConfig,
  OpenAIStructuredOutputProvider,
  type AIExecutionRecord,
  type AIExecutionRecorder,
  type OpenAIInputConfig,
  type OpenAIResponseRequest,
  type OpenAIResponseResult,
  type OpenAIResponsesClient
} from "./openai-structured-output-provider.js";

const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const config: OpenAIInputConfig = {
  apiKey: "unit-test-key",
  model: DEFAULT_OPENAI_INPUT_MODEL,
  reasoningEffort: "low",
  timeoutMs: 15_000,
  maxRetries: 0
};
const input = {
  userId,
  text: "금요일까지 데이터구조 과제 2시간 해야 해",
  receivedAt: "2026-09-03T10:00:00+09:00",
  timeZone: "Asia/Seoul",
  source: "manual" as const
};

const structuredOutput = {
  intent: "CREATE_TASK" as const,
  entities: [{
    entityType: "task_candidate" as const,
    data: {
      title: "데이터구조 과제",
      description: null,
      officialDeadline: "2026-09-04T23:59:59+09:00",
      estimatedMinutes: 120,
      importance: null,
      workContextHint: null,
      objectiveHint: null,
      executionMode: null,
      inferredFields: []
    },
    provenance: {
      title: "user_explicit" as const,
      description: null,
      officialDeadline: "user_explicit" as const,
      estimatedMinutes: "user_explicit" as const,
      importance: null,
      workContextHint: null,
      objectiveHint: null,
      executionMode: null
    },
    confidence: 0.98
  }],
  requiresConfirmation: false,
  clarificationQuestions: []
};

const completedResponse = (output: unknown = structuredOutput): OpenAIResponseResult => ({
  status: "completed",
  output_parsed: output,
  output: [{ type: "message", content: [{ type: "output_text" }] }],
  usage: { input_tokens: 40, output_tokens: 30 }
});

const clientReturning = (response: OpenAIResponseResult): OpenAIResponsesClient => ({
  parse: vi.fn(async () => response)
});

describe("OpenAI input provider configuration", () => {
  it("uses the configured model and stable low-reasoning defaults", () => {
    expect(loadOpenAIInputConfig({ OPENAI_API_KEY: "key", OPENAI_INPUT_MODEL: "custom-model" })).toEqual({
      apiKey: "key",
      model: "custom-model",
      reasoningEffort: "low",
      timeoutMs: 15_000,
      maxRetries: 0
    });
    expect(loadOpenAIInputConfig({ OPENAI_API_KEY: "key" }).model).toBe("gpt-5.6-luna");
  });

  it("maps a missing API key to the existing DomainError model", () => {
    expect(() => loadOpenAIInputConfig({})).toThrow(expect.objectContaining({
      code: "INVALID_INPUT",
      details: { missingEnvironmentVariable: "OPENAI_API_KEY" }
    }));
  });
});

describe("OpenAIStructuredOutputProvider", () => {
  it("maps timestamp, timezone, source, and raw text into a strict Responses API request", async () => {
    const requests: OpenAIResponseRequest[] = [];
    const parse = vi.fn(async (request: OpenAIResponseRequest): Promise<OpenAIResponseResult> => {
      requests.push(request);
      return completedResponse();
    });
    const provider = new OpenAIStructuredOutputProvider({ config, client: { parse } });

    await provider.generateStructuredOutput(input);

    const request = requests[0];
    expect(request).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning: { effort: "low" },
      store: false,
      text: { format: { type: "json_schema", name: "amber_input_parse_result", strict: true } }
    });
    expect(JSON.parse(request?.input ?? "{}")).toEqual({
      currentTimestamp: input.receivedAt,
      timeZone: "Asia/Seoul",
      source: "manual",
      rawUserText: input.text
    });
    expect(request?.input).not.toContain(userId);
    expect(request?.instructions).toContain("실행하지 말고 구조화");
  });

  it("normalizes nullable transport fields and validates with the canonical Zod schema", async () => {
    const provider = new OpenAIStructuredOutputProvider({ config, client: clientReturning(completedResponse()) });
    const result = await provider.generateStructuredOutput(input);

    expect(result.entities[0]?.data).toEqual({
      title: "데이터구조 과제",
      officialDeadline: "2026-09-04T23:59:59+09:00",
      estimatedMinutes: 120,
      inferredFields: []
    });
    expect(result.entities[0]?.provenance).toEqual({
      title: "user_explicit",
      officialDeadline: "user_explicit",
      estimatedMinutes: "user_explicit"
    });
  });

  it("rejects malformed structured output with PARSE_INVALID", async () => {
    const provider = new OpenAIStructuredOutputProvider({
      config,
      client: clientReturning(completedResponse({ intent: "CREATE_TASK" }))
    });
    await expect(provider.generateStructuredOutput(input)).rejects.toMatchObject({ code: "PARSE_INVALID" });
  });

  it("maps timeout and provider errors without exposing SDK errors", async () => {
    const timeoutProvider = new OpenAIStructuredOutputProvider({
      config,
      client: { parse: vi.fn(async () => { throw new APIConnectionTimeoutError(); }) }
    });
    await expect(timeoutProvider.generateStructuredOutput(input)).rejects.toMatchObject({
      code: "PARSE_FAILED",
      details: { provider: "openai", category: "timeout" }
    });

    const networkProvider = new OpenAIStructuredOutputProvider({
      config,
      client: { parse: vi.fn(async () => { throw new APIConnectionError({ cause: new Error("offline") }); }) }
    });
    await expect(networkProvider.generateStructuredOutput(input)).rejects.toMatchObject({
      code: "PARSE_FAILED",
      details: { provider: "openai", category: "network" }
    });

    const providerFailure = new OpenAIStructuredOutputProvider({
      config,
      client: { parse: vi.fn(async () => { throw new Error("provider secret detail"); }) }
    });
    await expect(providerFailure.generateStructuredOutput(input)).rejects.toMatchObject({
      code: "PARSE_FAILED",
      details: { provider: "openai", category: "provider" }
    });
  });

  it("rejects incomplete and refused responses", async () => {
    const incomplete = new OpenAIStructuredOutputProvider({
      config,
      client: clientReturning({ status: "incomplete", output_parsed: null, output: [] })
    });
    await expect(incomplete.generateStructuredOutput(input)).rejects.toMatchObject({
      code: "PARSE_FAILED",
      details: { category: "incomplete", responseStatus: "incomplete" }
    });

    const refused = new OpenAIStructuredOutputProvider({
      config,
      client: clientReturning({ status: "completed", output_parsed: null, output: [{ type: "message", content: [{ type: "refusal" }] }] })
    });
    await expect(refused.generateStructuredOutput(input)).rejects.toMatchObject({
      code: "PARSE_FAILED",
      details: { category: "refused" }
    });
  });

  it("records token and latency metadata while isolating telemetry failure", async () => {
    const records: AIExecutionRecord[] = [];
    const recorder: AIExecutionRecorder = { record: vi.fn(async (record) => { records.push(record); }) };
    const provider = new OpenAIStructuredOutputProvider({
      config,
      client: clientReturning(completedResponse()),
      executionRecorder: recorder,
      clock: { now: vi.fn()
        .mockReturnValueOnce(new Date("2026-09-03T01:00:00.000Z"))
        .mockReturnValueOnce(new Date("2026-09-03T01:00:00.125Z")) }
    });
    await provider.generateStructuredOutput(input);
    expect(records[0]).toMatchObject({
      userId,
      jobType: "parse_input",
      provider: "openai",
      model: "gpt-5.6-luna",
      status: "completed",
      inputTokens: 40,
      outputTokens: 30,
      latencyMs: 125
    });
    expect(records[0]?.inputContextHash).toMatch(/^[a-f0-9]{64}$/);

    const failingRecorder: AIExecutionRecorder = { record: vi.fn(async () => { throw new Error("db unavailable"); }) };
    const isolated = new OpenAIStructuredOutputProvider({
      config,
      client: clientReturning(completedResponse()),
      executionRecorder: failingRecorder
    });
    await expect(isolated.generateStructuredOutput(input)).resolves.toMatchObject({ intent: "CREATE_TASK" });
  });
});
