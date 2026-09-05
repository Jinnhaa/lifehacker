import type { Task } from "@amber/core";
import { DomainError, type TaskId, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import type { InputProcessingResult, TextInputValue } from "@amber/input";
import {
  DiscordMessageAdapter,
  type DiscordInboundMessage,
  type DiscordReplyPayload,
  type TextInputProcessor
} from "./discord-message-adapter.js";

const allowedDiscordUserId = "123456789012345678";
const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const taskId = "30000000-0000-4000-8000-000000000001" as TaskId;
const task: Task = {
  id: taskId,
  userId,
  workContextId: null,
  objectiveId: null,
  title: "데이터구조 과제",
  description: null,
  executionMode: "standard",
  officialDeadline: new Date("2026-09-04T14:59:59.000Z"),
  internalDeadline: null,
  estimatedMinutes: 120,
  estimatedUserMinutes: null,
  actualMinutes: 0,
  importance: 3,
  status: "INBOX",
  nextAction: null,
  completionCriteria: null,
  completionSource: null,
  createdAt: new Date("2026-09-03T01:00:00.000Z"),
  completedAt: null,
  updatedAt: new Date("2026-09-03T01:00:00.000Z")
};

const applied: InputProcessingResult = {
  status: "applied",
  inboxItemId: "inbox-1",
  parsedEntityId: "parsed-1",
  commandId: "command-1",
  taskId,
  duplicate: false
};

const message = (overrides: Partial<DiscordInboundMessage> = {}) => {
  const replies: DiscordReplyPayload[] = [];
  const value: DiscordInboundMessage = {
    id: "987654321098765432",
    content: "금요일까지 데이터구조 과제 2시간 해야 해",
    createdAt: new Date("2026-09-03T01:00:00.000Z"),
    guildId: null,
    author: { id: allowedDiscordUserId, bot: false },
    reply: async (payload) => { replies.push(payload); },
    ...overrides
  };
  return { value, replies };
};

const adapterWith = (processorResult: InputProcessingResult | Error = applied) => {
  const received: TextInputValue[] = [];
  const processor: TextInputProcessor = {
    processTextInput: vi.fn(async (input) => {
      received.push(input);
      if (processorResult instanceof Error) throw processorResult;
      return processorResult;
    })
  };
  const adapter = new DiscordMessageAdapter(
    allowedDiscordUserId,
    { resolve: vi.fn(async () => ({ userId, timeZone: "Asia/Seoul" })) },
    processor,
    { getTaskById: vi.fn(async () => task) }
  );
  return { adapter, processor, received };
};

describe("DiscordMessageAdapter", () => {
  it("maps an allowlisted DM to InputService once and formats a safe success reply", async () => {
    const { adapter, processor, received } = adapterWith();
    const incoming = message();

    await expect(adapter.handle(incoming.value)).resolves.toEqual({ kind: "replied", outcome: "applied" });

    expect(processor.processTextInput).toHaveBeenCalledTimes(1);
    expect(received[0]).toEqual({
      userId,
      text: "금요일까지 데이터구조 과제 2시간 해야 해",
      receivedAt: "2026-09-03T01:00:00.000Z",
      source: "discord",
      clientRequestId: "discord:987654321098765432"
    });
    expect(incoming.replies).toEqual([{
      content: "✅ 기록했어: 데이터구조 과제\n마감: 9/4(금) · 예상: 2시간",
      allowedMentions: { parse: [], repliedUser: false }
    }]);
  });

  it("routes 일어남 to Morning Workflow without creating a Task input", async () => {
    const { adapter: unused, processor } = adapterWith();
    void unused;
    const morningHandler = { handleMorningMessage: vi.fn(async () => ({ handled: true, reply: "오늘은 몇 시까지 할까?" })) };
    const adapter = new DiscordMessageAdapter(
      allowedDiscordUserId,
      { resolve: vi.fn(async () => ({ userId, timeZone: "Asia/Seoul" })) },
      processor,
      { getTaskById: vi.fn(async () => task) },
      morningHandler
    );
    const incoming = message({ content: "일어남" });

    await expect(adapter.handle(incoming.value)).resolves.toEqual({ kind: "replied", outcome: "workflow" });
    expect(morningHandler.handleMorningMessage).toHaveBeenCalledOnce();
    expect(processor.processTextInput).not.toHaveBeenCalled();
    expect(incoming.replies[0]?.content).toBe("오늘은 몇 시까지 할까?");
  });

  it("routes Focus commands before InputService", async () => {
    const { processor } = adapterWith();
    const focusHandler = { handleFocusMessage: vi.fn(async () => ({ handled: true, reply: "집중을 시작할게." })) };
    const adapter = new DiscordMessageAdapter(
      allowedDiscordUserId,
      { resolve: vi.fn(async () => ({ userId, timeZone: "Asia/Seoul" })) },
      processor,
      { getTaskById: vi.fn(async () => task) },
      { handleMorningMessage: vi.fn(async () => ({ handled: false })) },
      focusHandler
    );
    const incoming = message({ content: "시작" });

    await expect(adapter.handle(incoming.value)).resolves.toEqual({ kind: "replied", outcome: "workflow" });
    expect(focusHandler.handleFocusMessage).toHaveBeenCalledOnce();
    expect(processor.processTextInput).not.toHaveBeenCalled();
  });

  it.each([
    ["another user", { author: { id: "223456789012345678", bot: false } }],
    ["bot message", { author: { id: allowedDiscordUserId, bot: true } }],
    ["guild message", { guildId: "323456789012345678" }],
    ["empty message", { content: "   " }]
  ])("ignores %s before InputService", async (_label, overrides) => {
    const { adapter, processor } = adapterWith();
    const incoming = message(overrides);
    await expect(adapter.handle(incoming.value)).resolves.toEqual({ kind: "ignored" });
    expect(processor.processTextInput).not.toHaveBeenCalled();
    expect(incoming.replies).toHaveLength(0);
  });

  it("returns only the existing clarification questions", async () => {
    const { adapter } = adapterWith({
      status: "waiting_for_confirmation",
      inboxItemId: "inbox-2",
      parsedEntityId: "parsed-2",
      questions: ["언제까지 해야 하는 일이야?"],
      duplicate: false
    });
    const incoming = message();
    await adapter.handle(incoming.value);
    expect(incoming.replies[0]?.content).toBe("언제까지 해야 하는 일이야?");
  });

  it("hides internal failures from the user", async () => {
    const { adapter } = adapterWith(new Error("provider internal detail"));
    const incoming = message();
    await adapter.handle(incoming.value);
    expect(incoming.replies[0]?.content).toBe("지금은 기록하지 못했어. 잠시 후 다시 보내줘.");
    expect(incoming.replies[0]?.content).not.toContain("provider internal detail");
  });

  it("returns a short unsupported-input reply", async () => {
    const { adapter } = adapterWith(new DomainError("UNSUPPORTED_INTENT", "internal unsupported detail"));
    const incoming = message();
    await adapter.handle(incoming.value);
    expect(incoming.replies[0]?.content).toBe("아직 지원하지 않는 입력이야.");
  });
});
