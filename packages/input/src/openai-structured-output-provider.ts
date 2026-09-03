import { createHash } from "node:crypto";
import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { DomainError, SystemClock, type Clock, type UserId } from "@amber/shared";
import { z } from "zod";
import type { StructuredOutputProvider } from "./ai-interpreter.js";
import {
  parseResultSchema,
  provenanceSchema,
  type ParseInput,
  type ParseResult
} from "./contracts.js";

export const DEFAULT_OPENAI_INPUT_MODEL = "gpt-5.6-luna";
export const OPENAI_INPUT_PROMPT_VERSION = "input-parser-v1";
export const OPENAI_INPUT_TIMEOUT_MS = 15_000;

export interface OpenAIInputConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly reasoningEffort: "low";
  readonly timeoutMs: number;
  readonly maxRetries: 0;
}

export function loadOpenAIInputConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): OpenAIInputConfig {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new DomainError("INVALID_INPUT", "OpenAI input provider is not configured", {
      missingEnvironmentVariable: "OPENAI_API_KEY"
    });
  }
  return {
    apiKey,
    model: environment.OPENAI_INPUT_MODEL?.trim() || DEFAULT_OPENAI_INPUT_MODEL,
    reasoningEffort: "low",
    timeoutMs: OPENAI_INPUT_TIMEOUT_MS,
    maxRetries: 0
  };
}

const nullableProvenance = provenanceSchema.nullable();
const openAIParsedTaskDraftSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  officialDeadline: z.iso.datetime({ offset: true }).nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  workContextHint: z.string().trim().min(1).nullable(),
  objectiveHint: z.string().trim().min(1).nullable(),
  executionMode: z.enum(["standard", "learning_required", "output_focused", "mixed"]).nullable(),
  inferredFields: z.array(z.enum([
    "title",
    "description",
    "officialDeadline",
    "estimatedMinutes",
    "importance",
    "workContextHint",
    "objectiveHint",
    "executionMode"
  ]))
}).strict();

const openAIProvenanceSchema = z.object({
  title: nullableProvenance,
  description: nullableProvenance,
  officialDeadline: nullableProvenance,
  estimatedMinutes: nullableProvenance,
  importance: nullableProvenance,
  workContextHint: nullableProvenance,
  objectiveHint: nullableProvenance,
  executionMode: nullableProvenance
}).strict();

const openAIParseResultSchema = z.object({
  intent: z.enum(["CREATE_TASK", "CREATE_RECURRING_ACTIVITY", "UNKNOWN"]),
  entities: z.array(z.object({
    entityType: z.literal("task_candidate"),
    data: openAIParsedTaskDraftSchema,
    provenance: openAIProvenanceSchema,
    confidence: z.number().min(0).max(1)
  }).strict()),
  requiresConfirmation: z.boolean(),
  clarificationQuestions: z.array(z.string().trim().min(1))
}).strict();

const openAITextFormat = zodTextFormat(openAIParseResultSchema, "amber_input_parse_result");

const INPUT_PARSER_INSTRUCTIONS = [
  "사용자의 자연어를 실행하지 말고 구조화해서 해석한다.",
  "입력 JSON의 currentTimestamp와 timeZone만 사용해 상대 날짜를 계산한다.",
  "사용자가 직접 말한 값은 user_explicit, 문맥상 추론한 값은 ai_inferred로 표시한다.",
  "없는 필드는 null로 반환하고, ai_inferred 필드는 inferredFields에도 포함한다.",
  "명확하지 않은 필수 정보는 만들지 말고 requiresConfirmation과 clarificationQuestions로 표시한다.",
  "trusted_external 출처는 provenance에서 external로 기록한다.",
  "우선순위는 user_explicit > trusted_external > system_derived > ai_inferred이다."
].join("\n");

export interface OpenAIResponseRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly reasoning: { readonly effort: "low" };
  readonly text: { readonly format: typeof openAITextFormat };
  readonly store: false;
}

export interface OpenAIResponseResult {
  readonly status: "completed" | "failed" | "in_progress" | "cancelled" | "queued" | "incomplete";
  readonly output_parsed: unknown;
  readonly output: ReadonlyArray<{
    readonly type: string;
    readonly content?: ReadonlyArray<{ readonly type: string }>;
  }>;
  readonly usage?: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  } | null;
}

export interface OpenAIResponsesClient {
  parse(request: OpenAIResponseRequest): Promise<OpenAIResponseResult>;
}

export interface AIExecutionRecord {
  readonly userId: UserId;
  readonly jobType: "parse_input";
  readonly provider: "openai";
  readonly model: string;
  readonly promptVersion: string;
  readonly inputContextHash: string;
  readonly status: "completed" | "failed" | "incomplete" | "refused";
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly latencyMs: number;
  readonly createdAt: Date;
  readonly completedAt: Date;
}

export interface AIExecutionRecorder {
  record(record: AIExecutionRecord): Promise<void>;
}

export interface OpenAIStructuredOutputProviderOptions {
  readonly config: OpenAIInputConfig;
  readonly client?: OpenAIResponsesClient;
  readonly executionRecorder?: AIExecutionRecorder;
  readonly clock?: Clock;
}

export class OpenAIStructuredOutputProvider implements StructuredOutputProvider {
  private readonly client: OpenAIResponsesClient;
  private readonly clock: Clock;

  constructor(private readonly options: OpenAIStructuredOutputProviderOptions) {
    this.clock = options.clock ?? new SystemClock();
    this.client = options.client ?? createSDKClient(options.config);
  }

  static fromEnvironment(
    environment: Readonly<Record<string, string | undefined>> = process.env,
    options: Omit<OpenAIStructuredOutputProviderOptions, "config" | "client"> = {}
  ): OpenAIStructuredOutputProvider {
    return new OpenAIStructuredOutputProvider({
      ...options,
      config: loadOpenAIInputConfig(environment)
    });
  }

  async generateStructuredOutput(input: ParseInput): Promise<ParseResult> {
    const requestContext = JSON.stringify({
      currentTimestamp: input.receivedAt,
      timeZone: input.timeZone,
      source: input.source,
      rawUserText: input.text
    });
    const request: OpenAIResponseRequest = {
      model: this.options.config.model,
      instructions: INPUT_PARSER_INSTRUCTIONS,
      input: requestContext,
      reasoning: { effort: this.options.config.reasoningEffort },
      text: { format: openAITextFormat },
      store: false
    };
    const createdAt = this.clock.now();

    try {
      const response = await this.client.parse(request);
      const completedAt = this.clock.now();
      const commonRecord = this.executionRecord(input.userId, requestContext, createdAt, completedAt, response.usage);

      if (hasRefusal(response.output)) {
        await this.record({ ...commonRecord, status: "refused" });
        throw new DomainError("PARSE_FAILED", "OpenAI refused the input parsing request", {
          provider: "openai",
          category: "refused"
        });
      }
      if (response.status !== "completed") {
        await this.record({ ...commonRecord, status: response.status === "incomplete" ? "incomplete" : "failed" });
        throw new DomainError("PARSE_FAILED", "OpenAI did not complete the input parsing request", {
          provider: "openai",
          category: "incomplete",
          responseStatus: response.status
        });
      }

      const normalized = normalizeOpenAIResult(response.output_parsed);
      const validated = parseResultSchema.safeParse(normalized);
      if (!validated.success) {
        await this.record({ ...commonRecord, status: "failed" });
        throw new DomainError("PARSE_INVALID", "OpenAI structured output failed canonical validation", {
          issues: validated.error.issues
        });
      }
      await this.record({ ...commonRecord, status: "completed" });
      return validated.data;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const completedAt = this.clock.now();
      await this.record({
        ...this.executionRecord(input.userId, requestContext, createdAt, completedAt),
        status: "failed"
      });
      throw mapOpenAIError(error);
    }
  }

  private executionRecord(
    userId: UserId,
    requestContext: string,
    createdAt: Date,
    completedAt: Date,
    usage?: OpenAIResponseResult["usage"]
  ): Omit<AIExecutionRecord, "status"> {
    return {
      userId,
      jobType: "parse_input",
      provider: "openai",
      model: this.options.config.model,
      promptVersion: OPENAI_INPUT_PROMPT_VERSION,
      inputContextHash: createHash("sha256").update(requestContext).digest("hex"),
      ...(usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : {}),
      latencyMs: Math.max(0, completedAt.getTime() - createdAt.getTime()),
      createdAt,
      completedAt
    };
  }

  private async record(record: AIExecutionRecord): Promise<void> {
    try {
      await this.options.executionRecorder?.record(record);
    } catch {
      // Observability must not change parsing or Domain mutation outcomes.
    }
  }
}

function createSDKClient(config: OpenAIInputConfig): OpenAIResponsesClient {
  const client = new OpenAI({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries
  });
  return {
    async parse(request): Promise<OpenAIResponseResult> {
      const response = await client.responses.parse(request);
      return {
        status: response.status ?? "failed",
        output_parsed: response.output_parsed,
        output: response.output,
        ...(response.usage !== undefined ? { usage: response.usage } : {})
      };
    }
  };
}

function normalizeOpenAIResult(value: unknown): unknown {
  const parsed = openAIParseResultSchema.safeParse(value);
  if (!parsed.success) return value;
  return {
    ...parsed.data,
    entities: parsed.data.entities.map((entity) => ({
      ...entity,
      data: omitNullValues(entity.data),
      provenance: omitNullValues(entity.provenance)
    }))
  };
}

function omitNullValues<T extends Readonly<Record<string, unknown>>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== null));
}

function hasRefusal(output: OpenAIResponseResult["output"]): boolean {
  return output.some((item) => item.type === "refusal" || item.content?.some((content) => content.type === "refusal"));
}

function mapOpenAIError(error: unknown): DomainError {
  if (error instanceof z.ZodError) {
    return new DomainError("PARSE_INVALID", "OpenAI structured output was malformed", {
      issues: error.issues
    });
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new DomainError("PARSE_FAILED", "OpenAI input parsing timed out", {
      provider: "openai",
      category: "timeout"
    });
  }
  if (error instanceof APIConnectionError) {
    return new DomainError("PARSE_FAILED", "OpenAI input parsing network request failed", {
      provider: "openai",
      category: "network"
    });
  }
  if (error instanceof APIError) {
    return new DomainError("PARSE_FAILED", "OpenAI input parsing provider request failed", {
      provider: "openai",
      category: "provider",
      providerStatus: error.status
    });
  }
  return new DomainError("PARSE_FAILED", "OpenAI input parsing failed", {
    provider: "openai",
    category: "provider"
  });
}
