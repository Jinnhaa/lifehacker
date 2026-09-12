import { randomUUID } from "node:crypto";
import { createMorningPlan, SupabaseMorningRepository, SupabaseTaskRepository, TaskService } from "@amber/core";
import { FixedClock, type CorrelationId, type IdGenerator, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProviderAIInterpreter, type AIInterpreter } from "./ai-interpreter.js";
import type { ParseResult } from "./contracts.js";
import { DeterministicTestInterpreter } from "./deterministic-interpreter.js";
import { InputService } from "./input-service.js";
import {
  OpenAIStructuredOutputProvider,
  type OpenAIInputConfig,
  type OpenAIResponsesClient
} from "./openai-structured-output-provider.js";
import { SupabaseAIExecutionRecorder } from "./supabase-ai-execution-recorder.js";
import { SupabaseInputRepository } from "./supabase-input-repository.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = postgres(connectionString, { max: 5 });
const inputRepository = SupabaseInputRepository.connect(connectionString);
const taskRepository = SupabaseTaskRepository.connect(connectionString);
const userId = randomUUID() as UserId;
const ids: IdGenerator = { generateCorrelationId: () => randomUUID() as CorrelationId };
const clock = new FixedClock(new Date("2026-09-03T01:00:00.000Z"));

const taskResult = (overrides: Partial<ParseResult> = {}): ParseResult => ({
  intent: "CREATE_TASK",
  entities: [{
    entityType: "task_candidate",
    data: { title: "보고서 작성", inferredFields: [] },
    provenance: { title: "user_explicit" },
    confidence: 0.99
  }],
  requiresConfirmation: false,
  clarificationQuestions: [],
  ...overrides
});

const serviceWith = (interpreter: AIInterpreter): InputService =>
  new InputService(inputRepository, interpreter, new TaskService(taskRepository, clock, ids), ids);

const manualInput = (clientRequestId: string, text = "보고서 작성") => ({
  userId,
  text,
  receivedAt: "2026-09-03T23:30:00+09:00",
  source: "manual" as const,
  clientRequestId
});

beforeAll(async () => {
  await admin`insert into auth.users(id,email,created_at,updated_at) values (${userId},${`input-${userId}@example.test`},now(),now())`;
  await admin`insert into public.profiles(id,timezone) values (${userId},'Asia/Seoul')`;
});

afterAll(async () => {
  await admin`delete from auth.users where id=${userId}`;
  await inputRepository.close();
  await taskRepository.close();
  await admin.end();
});

describe("InputService CREATE_TASK pipeline", () => {
  it("records one AIExecution and keeps the existing TaskService event path", async () => {
    const client: OpenAIResponsesClient = {
      parse: async () => ({
        status: "completed",
        output_parsed: {
          intent: "CREATE_TASK",
          entities: [{
            entityType: "task_candidate",
            data: {
              title: "데이터구조 과제",
              description: null,
              officialDeadline: null,
              estimatedMinutes: 120,
              importance: null,
              workContextHint: null,
              objectiveHint: null,
              executionMode: null,
              inferredFields: []
            },
            provenance: {
              title: "user_explicit",
              description: null,
              officialDeadline: null,
              estimatedMinutes: "user_explicit",
              importance: null,
              workContextHint: null,
              objectiveHint: null,
              executionMode: null
            },
            confidence: 0.98
          }],
          requiresConfirmation: false,
          clarificationQuestions: []
        },
        output: [{ type: "message", content: [{ type: "output_text" }] }],
        usage: { input_tokens: 42, output_tokens: 31 }
      })
    };
    const config: OpenAIInputConfig = {
      apiKey: "integration-test-key",
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      timeoutMs: 15_000,
      maxRetries: 0
    };
    const interpreter = new ProviderAIInterpreter(new OpenAIStructuredOutputProvider({
      config,
      client,
      executionRecorder: new SupabaseAIExecutionRecorder(admin),
      clock
    }));
    const result = await serviceWith(interpreter).processManualText(
      manualInput("openai-provider-e2e", "데이터구조 과제 2시간 해야 해")
    );
    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("Expected applied result");

    const rows = await admin<{
      job_type: string; provider: string; model: string; status: string;
      input_tokens: number; output_tokens: number; event_type: string;
    }[]>`
      select a.job_type,a.provider,a.model,a.status,a.input_tokens,a.output_tokens,e.event_type
      from public.ai_executions a
      join public.domain_events e on e.user_id=a.user_id and e.aggregate_id=${result.taskId} and e.event_type='task_created'
      where a.user_id=${userId} and a.job_type='parse_input'
      order by a.created_at desc limit 1
    `;
    expect(rows[0]).toEqual({
      job_type: "parse_input",
      provider: "openai",
      model: "gpt-5.6-luna",
      status: "completed",
      input_tokens: 42,
      output_tokens: 31,
      event_type: "task_created"
    });
  });

  it("stores provenance and creates Task plus task_created event end-to-end", async () => {
    const interpreter = new DeterministicTestInterpreter(taskResult({
      entities: [{
        entityType: "task_candidate",
        data: {
          title: "보고서 작성",
          officialDeadline: "2027-01-01T00:00:00.000Z",
          inferredFields: ["officialDeadline"]
        },
        provenance: { title: "user_explicit", officialDeadline: "ai_inferred" },
        confidence: 0.95
      }]
    }));
    const result = await serviceWith(interpreter).processManualText(manualInput("e2e", "내일 보고서 작성 45분 중요도 5"));
    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("Expected applied result");

    const rows = await admin<{
      estimated_minutes: number; importance: number; official_deadline: Date;
      structured_data: { provenance: Record<string, string> }; command_payload: { provenance: Record<string, string> };
      event_type: string; inbox_correlation: string; event_correlation: string;
    }[]>`
      select t.estimated_minutes,t.importance,t.official_deadline,p.structured_data,
        c.payload as command_payload,e.event_type,i.correlation_id as inbox_correlation,e.correlation_id as event_correlation
      from public.tasks t
      join public.domain_commands c on c.result_entity_id=t.id
      join public.parsed_entities p on p.domain_command_id=c.id
      join public.inbox_items i on i.id=p.inbox_item_id
      join public.domain_events e on e.aggregate_id=t.id and e.event_type='task_created'
      where t.id=${result.taskId}
    `;
    expect(rows[0]).toMatchObject({ estimated_minutes: 45, importance: 5, event_type: "task_created" });
    expect(rows[0]?.official_deadline.toISOString()).toBe("2026-09-04T14:59:59.000Z");
    expect(rows[0]?.structured_data.provenance.officialDeadline).toBe("user_explicit");
    expect(rows[0]?.command_payload.provenance.officialDeadline).toBe("user_explicit");
    expect(rows[0]?.inbox_correlation).toBe(rows[0]?.event_correlation);
  });

  it("returns the existing result for the same request and creates one Inbox, Command, and Task", async () => {
    const service = serviceWith(new DeterministicTestInterpreter(taskResult()));
    const first = await service.processManualText(manualInput("duplicate"));
    const second = await service.processManualText(manualInput("duplicate"));
    expect(first.status).toBe("applied");
    expect(second).toMatchObject({ status: "applied", duplicate: true });
    if (first.status !== "applied" || second.status !== "applied") throw new Error("Expected applied results");
    expect(second.taskId).toBe(first.taskId);
    const counts = await admin<{ inbox_count: number; command_count: number; task_count: number }[]>`
      select
        (select count(*)::integer from public.inbox_items where user_id=${userId} and dedupe_key='manual:duplicate') inbox_count,
        (select count(*)::integer from public.domain_commands where user_id=${userId} and idempotency_key='manual:duplicate:CREATE_TASK:0') command_count,
        (select count(*)::integer from public.tasks where user_id=${userId} and id=${first.taskId}) task_count
    `;
    expect(counts[0]).toEqual({ inbox_count: 1, command_count: 1, task_count: 1 });
  });

  it("preserves an untouched AI-inferred field with field-level provenance", async () => {
    const result = await serviceWith(new DeterministicTestInterpreter(taskResult({
      entities: [{
        entityType: "task_candidate",
        data: { title: "범위 추정", estimatedMinutes: 90, inferredFields: ["estimatedMinutes"] },
        provenance: { title: "user_explicit", estimatedMinutes: "ai_inferred" },
        confidence: 0.8
      }]
    }))).processManualText(manualInput("inferred", "범위 추정"));
    expect(result.status).toBe("applied");
    const rows = await admin<{ structured_data: { provenance: Record<string, string> }; payload: { provenance: Record<string, string>; task: { importance: number; executionMode: string } } }[]>`
      select p.structured_data,c.payload from public.inbox_items i
      join public.parsed_entities p on p.inbox_item_id=i.id
      join public.domain_commands c on c.id=p.domain_command_id
      where i.user_id=${userId} and i.dedupe_key='manual:inferred'
    `;
    expect(rows[0]?.structured_data.provenance.estimatedMinutes).toBe("ai_inferred");
    expect(rows[0]?.payload.provenance.importance).toBe("system_derived");
    expect(rows[0]?.payload.task).toMatchObject({ importance: 3, executionMode: "standard" });
  });

  it("marks malformed structured output failed and creates no Task", async () => {
    const malformed: AIInterpreter = { parseInput: async () => ({ intent: "CREATE_TASK" }) as never };
    const before = await admin<{ count: number }[]>`select count(*)::integer as count from public.tasks where user_id=${userId}`;
    await expect(serviceWith(malformed).processManualText(manualInput("malformed"))).rejects.toMatchObject({ code: "PARSE_INVALID" });
    const after = await admin<{ count: number }[]>`select count(*)::integer as count from public.tasks where user_id=${userId}`;
    const inbox = await admin<{ parse_status: string }[]>`select parse_status from public.inbox_items where user_id=${userId} and dedupe_key='manual:malformed'`;
    expect(after[0]?.count).toBe(before[0]?.count);
    expect(inbox[0]?.parse_status).toBe("failed");
  });

  it("stores a confirmation-needed entity without creating a command or Task", async () => {
    const before = await admin<{ count: number }[]>`select count(*)::integer as count from public.tasks where user_id=${userId}`;
    const result = await serviceWith(new DeterministicTestInterpreter(taskResult({
      requiresConfirmation: true,
      clarificationQuestions: ["마감일을 확인해 주세요."]
    }))).processManualText(manualInput("confirmation"));
    expect(result).toMatchObject({ status: "waiting_for_confirmation", questions: ["마감일을 확인해 주세요."] });
    const after = await admin<{ count: number }[]>`select count(*)::integer as count from public.tasks where user_id=${userId}`;
    const rows = await admin<{ parse_status: string; processing_status: string; domain_command_id: string | null }[]>`
      select i.parse_status,p.processing_status,p.domain_command_id from public.inbox_items i
      join public.parsed_entities p on p.inbox_item_id=i.id where i.user_id=${userId} and i.dedupe_key='manual:confirmation'
    `;
    expect(after[0]?.count).toBe(before[0]?.count);
    expect(rows[0]).toEqual({ parse_status: "waiting_for_confirmation", processing_status: "validated", domain_command_id: null });
  });

  it("rejects UNKNOWN intent without a DomainCommand or Task", async () => {
    const before = await admin<{ count: number }[]>`select count(*)::integer as count from public.tasks where user_id=${userId}`;
    await expect(serviceWith(new DeterministicTestInterpreter({
      intent: "UNKNOWN", entities: [], requiresConfirmation: false, clarificationQuestions: []
    })).processManualText(manualInput("unknown"))).rejects.toMatchObject({ code: "UNSUPPORTED_INTENT" });
    const after = await admin<{ count: number }[]>`select count(*)::integer as count from public.tasks where user_id=${userId}`;
    const commands = await admin<{ count: number }[]>`
      select count(*)::integer as count from public.domain_commands c
      join public.inbox_items i on i.correlation_id=c.correlation_id
      where i.user_id=${userId} and i.dedupe_key='manual:unknown'
    `;
    expect(after[0]?.count).toBe(before[0]?.count);
    expect(commands[0]?.count).toBe(0);
  });

  it("resolves a unique WorkContext and refuses an ambiguous match", async () => {
    const uniqueId = randomUUID();
    await admin`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values (${uniqueId},${userId},'project','Intake Unique','active','auto')`;
    const resolved = await serviceWith(new DeterministicTestInterpreter(taskResult({ entities: [{
      entityType: "task_candidate", data: { title: "문맥 업무", workContextHint: "intake unique", inferredFields: ["workContextHint"] },
      provenance: { title: "user_explicit", workContextHint: "ai_inferred" }, confidence: 0.9
    }] }))).processManualText(manualInput("context-unique", "문맥 업무"));
    expect(resolved.status).toBe("applied");
    if (resolved.status !== "applied") throw new Error("Expected applied");
    const taskRows = await admin<{ work_context_id: string | null }[]>`select work_context_id from public.tasks where id=${resolved.taskId}`;
    expect(taskRows[0]?.work_context_id).toBe(uniqueId);

    await admin`insert into public.work_contexts(user_id,kind,title,status,agent_mode) values (${userId},'project','Ambiguous Alpha','active','auto'),(${userId},'project','Ambiguous Beta','active','auto')`;
    const ambiguous = await serviceWith(new DeterministicTestInterpreter(taskResult({ entities: [{
      entityType: "task_candidate", data: { title: "모호한 업무", workContextHint: "Ambiguous", inferredFields: ["workContextHint"] },
      provenance: { title: "user_explicit", workContextHint: "ai_inferred" }, confidence: 0.7
    }] }))).processManualText(manualInput("context-ambiguous", "모호한 업무"));
    expect(ambiguous.status).toBe("waiting_for_confirmation");
    const rows = await admin<{ count: number }[]>`select count(*)::int count from public.tasks where user_id=${userId} and title='모호한 업무'`;
    expect(rows[0]?.count).toBe(0);
  });

  it("resumes one pending confirmation, applies corrections, and dedupes the reply", async () => {
    await admin`update public.parsed_entities p set processing_status='rejected' from public.inbox_items i where p.inbox_item_id=i.id and p.user_id=${userId} and i.parse_status='waiting_for_confirmation'`;
    await admin`update public.inbox_items set parse_status='applied' where user_id=${userId} and parse_status='waiting_for_confirmation'`;
    const service = serviceWith(new DeterministicTestInterpreter(taskResult({ requiresConfirmation: true, clarificationQuestions: ["예상 시간을 알려줘."] })));
    await service.processManualText(manualInput("resume-confirmation", "보고서 작성"));
    const reply = { userId, text: "30분이면 돼", receivedAt: new Date(), clientRequestId: "confirmation-reply-1" };
    const first = await service.processConfirmationReply(reply);
    const second = await service.processConfirmationReply(reply);
    expect(first).toMatchObject({ handled: true, status: "applied", duplicate: false });
    expect(second).toMatchObject({ handled: true, status: "applied", duplicate: true });
    if (!first.handled || first.status !== "applied") throw new Error("Expected applied confirmation");
    const rows = await admin<{ estimated_minutes: number; count: number }[]>`
      select min(estimated_minutes)::int estimated_minutes,count(*)::int count from public.tasks where user_id=${userId} and id=${first.taskId}
    `;
    expect(rows[0]).toEqual({ estimated_minutes: 30, count: 1 });
  });

  it("materializes a clear Notion item once, keeps low-confidence work pending, and exposes the task to Morning", async () => {
    const contextId = randomUUID();
    await admin`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values (${contextId},${userId},'project','Notion Intake','active','auto')`;
    const service = serviceWith(new DeterministicTestInterpreter(taskResult()));
    const item = {
      source: "notion" as const, sourceItemId: `page-${randomUUID()}`, sourceVersion: "v1", sourceUrl: "https://notion.so/test",
      observedAt: new Date(), title: "Notion 발견 업무", officialDeadline: new Date("2026-09-12T02:00:00Z"),
      workContextHint: "Notion Intake", objectiveHint: null, status: "open" as const, taskSemantics: "clear" as const,
      rawPayload: { sourceId: "test-source" }
    };
    const first = await service.processDiscoveredWorkItem(userId, item);
    const second = await service.processDiscoveredWorkItem(userId, { ...item, sourceVersion: "v2", observedAt: new Date(Date.now() + 1_000) });
    expect(first.status).toBe("materialized");
    expect(second).toMatchObject({ status: "materialized", duplicate: true });
    if (first.status !== "materialized") throw new Error("Expected materialized Notion item");
    expect(second.status === "materialized" && second.taskId).toBe(first.taskId);
    const refs = await admin<{ internal_entity_type: string; internal_entity_id: string; external_version: string }[]>`
      select internal_entity_type,internal_entity_id,external_version from public.external_references where user_id=${userId} and source='notion' and external_id=${item.sourceItemId}
    `;
    expect(refs[0]).toEqual({ internal_entity_type: "task", internal_entity_id: first.taskId, external_version: "v2" });

    const low = await service.processDiscoveredWorkItem(userId, { ...item, sourceItemId: `note-${randomUUID()}`, title: "단순 메모", officialDeadline: null, workContextHint: null, status: "unknown", taskSemantics: "unclear" });
    expect(low.status).toBe("needs_confirmation");
    const confirmed = await service.processConfirmationReply({ userId, text: "맞아", receivedAt: new Date(), clientRequestId: "notion-low-confirm" });
    expect(confirmed).toMatchObject({ handled: true, status: "applied" });
    if (!confirmed.handled || confirmed.status !== "applied") throw new Error("Expected confirmed Notion item");
    const promoted = await admin<{ internal_entity_type: string; internal_entity_id: string }[]>`
      select internal_entity_type,internal_entity_id from public.external_references where user_id=${userId} and internal_entity_id=${confirmed.taskId}
    `;
    expect(promoted[0]).toEqual({ internal_entity_type: "task", internal_entity_id: confirmed.taskId });
    const observation = await new SupabaseMorningRepository(admin).loadObservation(userId, "2026-09-12", "Asia/Seoul");
    expect(observation.tasks.some((task) => task.id === first.taskId)).toBe(true);
    const proposal = createMorningPlan({ observation, now: new Date("2026-09-12T00:00:00Z"), workUntil: new Date("2026-09-12T09:00:00Z"), privateIntervals: [], localWeekday: 6 });
    expect(proposal.items.some((entry) => entry.taskId === first.taskId)).toBe(true);
  });

  it("does not guess when multiple confirmations exist and expires stale candidates", async () => {
    await admin`update public.parsed_entities p set processing_status='rejected' from public.inbox_items i where p.inbox_item_id=i.id and p.user_id=${userId} and i.parse_status='waiting_for_confirmation'`;
    await admin`update public.inbox_items set parse_status='applied' where user_id=${userId} and parse_status='waiting_for_confirmation'`;
    const service = serviceWith(new DeterministicTestInterpreter(taskResult({ requiresConfirmation: true })));
    await service.processManualText(manualInput("multiple-a"));
    await service.processManualText(manualInput("multiple-b"));
    await expect(service.processConfirmationReply({ userId, text: "맞아", receivedAt: new Date(), clientRequestId: "multiple-reply" }))
      .resolves.toMatchObject({ handled: true, status: "needs_selection" });
    await admin`update public.parsed_entities p set processing_status='rejected' from public.inbox_items i where p.inbox_item_id=i.id and p.user_id=${userId} and i.parse_status='waiting_for_confirmation'`;
    await admin`update public.inbox_items set parse_status='applied' where user_id=${userId} and parse_status='waiting_for_confirmation'`;
    await service.processManualText(manualInput("stale"));
    await admin`update public.parsed_entities set created_at=now()-interval '25 hours' where user_id=${userId} and processing_status='validated' and requires_confirmation=true`;
    await expect(service.processConfirmationReply({ userId, text: "맞아", receivedAt: new Date(), clientRequestId: "stale-reply" }))
      .resolves.toMatchObject({ handled: true, status: "expired" });
  });
});
