import type { DerivedCurrentAction } from "../execution/current-action.js";
import type {
  BlockCategory,
  CompleteFocusResult,
  FocusContext,
  FocusMessage,
  FocusMessageHandler,
  FocusMessageResult,
  FocusServiceDependencies,
  RecoveryResult
} from "./focus.js";

const BLOCK_QUESTION = "어떤 종류의 막힘이야? 뭘 해야 할지 불명확함 / 어려움 / 하기 싫음 / 완벽주의 / 필요한 자료 없음 / 기타 중에서 알려줘.";
const SWITCH_GUARDRAIL = "지금 작업을 멈추고 다음 작업으로 넘어갈까? 진행 상태는 저장해둘게. 그래도 바꾸려면 ‘다음 거 할래’라고 한 번 더 보내줘.";

export const classifyBlockReason = (text: string): BlockCategory | null => {
  const normalized = text.trim().toLowerCase();
  if (/^(unclear|hard|avoidance|perfectionism|missing_material|other)$/.test(normalized)) return normalized as BlockCategory;
  if (/(자료|파일|권한|답변|사람|연락|준비물).*(없|필요|못)|(없|필요).*(자료|파일|권한|답변|사람|연락|준비물)/.test(normalized)) return "missing_material";
  if (/(완벽|퀄리티|품질|잘해야)/.test(normalized)) return "perfectionism";
  if (/(하기 싫|미루|손이 안|귀찮|회피)/.test(normalized)) return "avoidance";
  if (/(어려|이해 안|모르겠는데.*어렵|난이도)/.test(normalized)) return "hard";
  if (/(뭘 해야|무엇을 해야|불명확|애매|다음 행동|모르겠)/.test(normalized)) return "unclear";
  if (/(기타|다른 이유)/.test(normalized)) return "other";
  return null;
};

const localDate = (value: Date, timeZone: string): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const duration = (minutes: number): string => minutes < 60
  ? `${minutes}분`
  : minutes % 60 === 0 ? `${minutes / 60}시간` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;

const formatFocus = (context: FocusContext, includeFlow: boolean): string => {
  const details = [
    `Task: ${context.taskTitle}`,
    context.taskCompletionCriteria ? `완료 기준: ${context.taskCompletionCriteria}` : null,
    context.estimatedMinutes !== null ? `예상 시간: ${duration(context.estimatedMinutes)}` : null
  ].filter((value): value is string => value !== null);
  if (includeFlow && context.steps.length > 0) {
    details.push(`전체 흐름:\n${context.steps.map((step) => `${step.position}. ${step.title} [${step.owner === "user" ? "사용자" : "AI"}]`).join("\n")}`);
  }
  if (context.currentStep) {
    details.push(`지금 Step: ${context.currentStep.title}${context.currentStep.completionCriteria ? `\nStep 완료 기준: ${context.currentStep.completionCriteria}` : ""}`);
  }
  else if (context.nextAction) details.push(`지금 행동: ${context.nextAction}`);
  return details.join("\n\n");
};

const nextActionText = (action: DerivedCurrentAction | null): string => action
  ? `다음 할 일은 ${action.title}이야. 시작하려면 “시작”이라고 보내줘.`
  : "다음 Current Action은 없어.";

const formatCompletion = (result: CompleteFocusResult): string => result.kind === "next_step"
  ? `Step을 완료했어.\n\n${formatFocus(result.context, false)}`
  : `${result.taskTitle}을 완료했어.\n\n${nextActionText(result.nextAction)}`;

export const formatRecovery = (result: RecoveryResult): string => {
  const context = result.context;
  switch (result.category) {
    case "unclear":
      return `지금은 ${context.currentStep?.title ?? context.nextAction ?? context.taskTitle}만 하면 돼.${context.currentStep?.completionCriteria ? ` 완료 기준은 “${context.currentStep.completionCriteria}”이야.` : context.taskCompletionCriteria ? ` 완료 기준은 “${context.taskCompletionCriteria}”이야.` : ""}\n다시 시작하려면 “다시 할게”라고 보내줘.`;
    case "hard":
      return `현재 Step을 두 개의 더 작은 실행 단위로 나눌게. “다시 할게”라고 보내면 작은 단위부터 시작해.`;
    case "avoidance":
      return `${context.currentStep?.title ?? context.nextAction ?? context.taskTitle}을 5분만 시작하자. “다시 할게”라고 보내면 바로 이어갈게.`;
    case "perfectionism":
      return `최소 완료선에 맞추자.${context.currentStep?.completionCriteria ? ` 현재 Step 완료 기준은 “${context.currentStep.completionCriteria}”이야.` : context.taskCompletionCriteria ? ` Task 완료 기준은 “${context.taskCompletionCriteria}”이야.` : " 지금 Step을 끝내는 데 필요한 만큼만 하자."}\n“다시 할게”라고 보내면 이어갈게.`;
    case "missing_material":
      return `필요한 자료/사람: ${result.detail}\n기다리는 것으로 기록하고 Task를 막힘 상태로 바꿨어.\n${nextActionText(result.nextAction)}`;
    case "other":
      return `막힌 이유를 기록했어. 지금 할 수 있는 가장 작은 다음 행동부터 다시 시작하자. “다시 할게”라고 보내면 이어갈게.`;
  }
};

export class FocusWorkflowService implements FocusMessageHandler {
  private readonly repository: FocusServiceDependencies["repository"];
  private readonly clock: FocusServiceDependencies["clock"];
  private readonly replanner: FocusServiceDependencies["replanner"];
  private readonly decisionLearning: FocusServiceDependencies["decisionLearning"];

  constructor(dependencies: FocusServiceDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
    this.replanner = dependencies.replanner;
    this.decisionLearning = dependencies.decisionLearning;
  }

  async handleFocusMessage(message: FocusMessage): Promise<FocusMessageResult> {
    const text = message.text.trim();
    const planDate = localDate(message.receivedAt, message.timeZone);
    const workflow = await this.repository.findCurrentWorkflow(message.userId);
    if (workflow?.checkpoint.lastMessageId === message.messageId) {
      return { handled: true, reply: workflow.checkpoint.lastReply ?? "이미 처리했어." };
    }

    if (workflow?.currentStep === "awaiting_block_reason") return this.handleBlockReason(message);
    if (workflow?.currentStep === "awaiting_missing_detail") return this.finishDetailedBlock(message, planDate, "missing_material");
    if (workflow?.currentStep === "awaiting_other_detail") return this.finishDetailedBlock(message, planDate, "other");
    if ((text === "다시 할게") && workflow?.currentStep === "recovery_ready") {
      const context = await this.repository.resume(message.userId, this.clock.now(), message.messageId);
      return { handled: true, reply: context ? `다시 시작했어.\n\n${formatFocus(context, false)}` : "재개할 Focus가 없어." };
    }
    if (text === "시작" || text === "시작할게") {
      if (workflow?.currentStep === "recovery_ready" && workflow.checkpoint.blockCategory !== "missing_material") {
        return { handled: true, reply: "중단한 Focus를 이어가려면 “다시 할게”라고 보내줘." };
      }
      const result = await this.repository.start(message.userId, planDate, this.clock.now(), message.messageId);
      if (!result.action) return { handled: true, reply: "지금 시작할 Current Action이 없어." };
      if (result.action.kind !== "task") return { handled: true, reply: `현재 행동은 ${result.action.title} 반복활동이야. Task FocusSession은 만들지 않았어.` };
      if (!result.context) return { handled: true, reply: "지금은 Focus를 시작하지 못했어." };
      return { handled: true, reply: result.duplicate ? `이미 집중 중이야.\n\n${formatFocus(result.context, false)}` : `집중을 시작할게.\n\n${formatFocus(result.context, true)}` };
    }
    if (text === "완료" || text === "끝") {
      const result = await this.repository.complete(message.userId, planDate, this.clock.now(), message.messageId);
      if (!result) return { handled: true, reply: "완료할 active Focus가 없어." };
      const adjustment = await this.replanAdjustment(message);
      return {
        handled: true,
        reply: adjustment && result.kind === "task_completed"
          ? `${result.taskTitle}을 완료했어.\n\n${adjustment}`
          : formatCompletion(result)
      };
    }
    if (text === "막혔어") {
      const context = await this.repository.requestBlockReason(message.userId, this.clock.now(), message.messageId);
      return { handled: true, reply: context ? BLOCK_QUESTION : "막힘을 기록할 active Focus가 없어." };
    }
    if (text.startsWith("다른 거 할래") || text.startsWith("다음 거 할래")) {
      if (workflow?.currentStep === "awaiting_switch_confirmation") {
        const context = workflow;
        const result = await this.repository.confirmSwitch(message.userId, planDate, this.clock.now(), message.messageId);
        if (!result) return { handled: true, reply: "전환할 active Focus가 없어." };
        const adjustment = await this.replanAdjustment(message);
        const baseReply = adjustment
          ? `${result.previousTaskTitle}의 진행 상태를 저장했어.\n\n${adjustment}`
          : `${result.previousTaskTitle}의 진행 상태를 저장했어.\n\n${nextActionText(result.nextAction)}`;
        const followUp = context && this.decisionLearning
          ? await this.decisionLearning.recordMaterialDecision({
              userId: message.userId,
              workflowRunId: context.id,
              idempotencyKey: `focus-switch:${context.id}`,
              decisionType: "focus_task_switch",
              situation: {
                planDate,
                taskIds: [context.checkpoint.taskId],
                sessionIds: [context.checkpoint.sessionId]
              },
              amberRecommendation: { action: "continue_current_task", taskId: context.checkpoint.taskId },
              userChoice: { action: "switch_task", taskId: context.checkpoint.taskId },
              userMessage: message.text,
              occurredAt: this.clock.now()
            })
          : null;
        return {
          handled: true,
          reply: followUp ? `${baseReply}\n\n${followUp}` : baseReply
        };
      }
      const context = await this.repository.requestSwitch(message.userId, this.clock.now(), message.messageId);
      return { handled: true, reply: context ? SWITCH_GUARDRAIL : "전환할 active Focus가 없어." };
    }
    return { handled: false };
  }

  private async handleBlockReason(message: FocusMessage): Promise<FocusMessageResult> {
    const category = classifyBlockReason(message.text);
    if (!category) return { handled: true, reply: BLOCK_QUESTION };
    if (category === "missing_material" || category === "other") {
      await this.repository.waitForBlockDetail(message.userId, category, message.text, this.clock.now(), message.messageId);
      return {
        handled: true,
        reply: category === "missing_material" ? "어떤 자료나 누구의 도움이 필요한지 짧게 알려줘." : "막힌 이유를 한 문장으로 알려줘."
      };
    }
    const result = await this.repository.recordBlock(
      message.userId,
      localDate(message.receivedAt, message.timeZone),
      category,
      message.text,
      this.clock.now(),
      message.messageId
    );
    return { handled: true, reply: result ? formatRecovery(result) : "막힘을 기록할 active Focus가 없어." };
  }

  private async finishDetailedBlock(message: FocusMessage, planDate: string, category: "missing_material" | "other"): Promise<FocusMessageResult> {
    if (message.text.trim().length === 0) return { handled: true, reply: "짧게 한 문장으로 알려줘." };
    const result = await this.repository.recordBlock(message.userId, planDate, category, message.text, this.clock.now(), message.messageId);
    if (!result) return { handled: true, reply: "막힘을 기록할 active Focus가 없어." };
    const adjustment = await this.replanAdjustment(message);
    return { handled: true, reply: adjustment ? `${formatRecovery(result)}\n\n${adjustment}` : formatRecovery(result) };
  }

  private async replanAdjustment(message: FocusMessage): Promise<string | null> {
    if (!this.replanner) return null;
    try {
      return await this.replanner.processLatestTrigger(message.userId, message.timeZone, message.receivedAt);
    } catch {
      return null;
    }
  }
}
