import type { ChiefMessageHandler, DayCloseMessageHandler, FocusMessageHandler, MorningMessageHandler, PrincipleApprovalMessageHandler, ReplanMessageHandler, Task, TaskRepository, WakeMessageHandler } from "@amber/core";
import { DomainError, type TaskId, type UserId } from "@amber/shared";
import type { InputProcessingResult, TextInputValue } from "@amber/input";
import type { DiscordUserResolver } from "./discord-user-resolver.js";
import { formatConfirmationReply, formatTaskCreatedReply } from "./reply-formatter.js";

const SAFE_ALLOWED_MENTIONS = { parse: [] as const, repliedUser: false as const };

export interface DiscordReplyPayload {
  readonly content: string;
  readonly allowedMentions: typeof SAFE_ALLOWED_MENTIONS;
}

export interface DiscordInboundMessage {
  readonly id: string;
  readonly content: string;
  readonly createdAt: Date;
  readonly guildId: string | null;
  readonly author: {
    readonly id: string;
    readonly bot: boolean;
  };
  reply(payload: DiscordReplyPayload): Promise<void>;
}

export interface TextInputProcessor {
  processTextInput(input: TextInputValue): Promise<InputProcessingResult>;
}

export interface TaskSummaryReader {
  getTaskById(userId: UserId, taskId: TaskId): Promise<Task | null>;
}

export type DiscordMessageHandlingResult =
  | { readonly kind: "ignored" }
  | { readonly kind: "replied"; readonly outcome: "workflow" | "applied" | "confirmation" | "pending" | "unsupported" | "failed" };

export class DiscordMessageAdapter {
  constructor(
    private readonly allowedDiscordUserId: string,
    private readonly userResolver: DiscordUserResolver,
    private readonly inputProcessor: TextInputProcessor,
    private readonly taskReader: Pick<TaskRepository, "getTaskById"> | TaskSummaryReader,
    private readonly morningHandler?: MorningMessageHandler,
    private readonly focusHandler?: FocusMessageHandler,
    private readonly replanHandler?: ReplanMessageHandler,
    private readonly dayCloseHandler?: DayCloseMessageHandler,
    private readonly wakeHandler?: WakeMessageHandler,
    private readonly principleApprovalHandler?: PrincipleApprovalMessageHandler,
    private readonly chiefHandler?: ChiefMessageHandler
  ) {}

  async handle(message: DiscordInboundMessage): Promise<DiscordMessageHandlingResult> {
    if (
      message.guildId !== null
      || message.author.bot
      || message.author.id !== this.allowedDiscordUserId
      || message.content.trim().length === 0
    ) {
      return { kind: "ignored" };
    }

    try {
      const identity = await this.userResolver.resolve(message.author.id);
      if (!identity) return this.reply(message, "지금은 기록하지 못했어. 잠시 후 다시 보내줘.", "failed");

      if (this.dayCloseHandler) {
        const dayClose = await this.dayCloseHandler.handleDayCloseMessage({
          userId: identity.userId,
          timeZone: identity.timeZone,
          text: message.content,
          messageId: `discord:${message.id}`,
          receivedAt: message.createdAt
        });
        if (dayClose.handled && dayClose.reply) return this.reply(message, dayClose.reply, "workflow");
      }

      if (this.wakeHandler) {
        const wake = await this.wakeHandler.handleWakeMessage({
          userId: identity.userId,
          timeZone: identity.timeZone,
          text: message.content,
          messageId: `discord:${message.id}`,
          receivedAt: message.createdAt
        });
        if (wake.handled && wake.reply) return this.reply(message, wake.reply, "workflow");
      }

      if (this.replanHandler) {
        const replan = await this.replanHandler.handleReplanMessage({
          userId: identity.userId,
          timeZone: identity.timeZone,
          text: message.content,
          messageId: `discord:${message.id}`,
          receivedAt: message.createdAt
        });
        if (replan.handled && replan.reply) return this.reply(message, replan.reply, "workflow");
      }

      if (this.morningHandler) {
        const morning = await this.morningHandler.handleMorningMessage({
          userId: identity.userId,
          timeZone: identity.timeZone,
          text: message.content,
          messageId: `discord:${message.id}`,
          receivedAt: message.createdAt
        });
        if (morning.handled && morning.reply) return this.reply(message, morning.reply, "workflow");
      }

      if (this.focusHandler) {
        const focus = await this.focusHandler.handleFocusMessage({
          userId: identity.userId,
          timeZone: identity.timeZone,
          text: message.content,
          messageId: `discord:${message.id}`,
          receivedAt: message.createdAt
        });
        if (focus.handled && focus.reply) return this.reply(message, focus.reply, "workflow");
      }

      if (this.principleApprovalHandler) {
        const principle = await this.principleApprovalHandler.handlePrincipleApprovalMessage({
          userId: identity.userId,
          text: message.content,
          messageId: `discord:${message.id}`,
          receivedAt: message.createdAt
        });
        if (principle.handled && principle.reply) return this.reply(message, principle.reply, "workflow");
      }

      if (this.chiefHandler) {
        const chief = await this.chiefHandler.handleChiefMessage({
          userId: identity.userId,
          timeZone: identity.timeZone,
          text: message.content,
          messageId: `discord:${message.id}`,
          receivedAt: message.createdAt
        });
        if (chief.handled && chief.reply) return this.reply(message, chief.reply, "workflow");
      }

      const result = await this.inputProcessor.processTextInput({
        userId: identity.userId,
        text: message.content,
        receivedAt: message.createdAt.toISOString(),
        source: "discord",
        clientRequestId: `discord:${message.id}`
      });
      return this.replyForResult(message, result, identity.userId, identity.timeZone);
    } catch (error) {
      if (error instanceof DomainError && error.code === "UNSUPPORTED_INTENT") {
        return this.reply(message, "아직 지원하지 않는 입력이야.", "unsupported");
      }
      return this.reply(message, "지금은 기록하지 못했어. 잠시 후 다시 보내줘.", "failed");
    }
  }

  private async replyForResult(
    message: DiscordInboundMessage,
    result: InputProcessingResult,
    userId: UserId,
    timeZone: string
  ): Promise<DiscordMessageHandlingResult> {
    if (result.status === "waiting_for_confirmation") {
      return this.reply(message, formatConfirmationReply(result.questions), "confirmation");
    }
    if (result.status === "pending") {
      return this.reply(message, "이미 처리 중이야.", "pending");
    }
    if (result.status === "failed") {
      return this.reply(message, "지금은 기록하지 못했어. 잠시 후 다시 보내줘.", "failed");
    }
    const task = await this.taskReader.getTaskById(userId, result.taskId);
    if (!task) return this.reply(message, "지금은 기록하지 못했어. 잠시 후 다시 보내줘.", "failed");
    return this.reply(message, formatTaskCreatedReply(task, timeZone), "applied");
  }

  private async reply(
    message: DiscordInboundMessage,
    content: string,
    outcome: Extract<DiscordMessageHandlingResult, { kind: "replied" }>["outcome"]
  ): Promise<DiscordMessageHandlingResult> {
    await message.reply({ content, allowedMentions: SAFE_ALLOWED_MENTIONS });
    return { kind: "replied", outcome };
  }
}
