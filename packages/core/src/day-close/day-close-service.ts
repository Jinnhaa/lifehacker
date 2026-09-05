import type { DayCloseMessage, DayCloseMessageHandler, DayCloseMessageResult, DayCloseObservation, DayCloseResult, DayCloseServiceDependencies, DayCloseWorkflowRun } from "./day-close.js";

const triggers = new Set(["오늘 끝", "오늘은 끝", "잘게", "이제 잘게"]);
const confirmations = new Set(["응", "그래", "확인", "마칠게", "여기까지 할게", ...triggers]);
const FOCUS_GUARDRAIL = "지금 진행 중인 작업이 있어. 여기까지 하고 오늘을 마칠까?";

const localDate = (value: Date, timeZone: string): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

export const calculateDayCloseResult = (observation: DayCloseObservation, date: string, closedAt: Date): DayCloseResult => {
  const actionable = observation.planItems.filter((item) => item.itemType === "task" || item.itemType === "routine");
  const completedItems = actionable.filter((item) =>
    item.status === "completed" || item.taskStatus === "DONE" || item.occurrenceStatus === "completed");
  const incompleteItems = actionable.filter((item) =>
    !completedItems.includes(item) && !["cancelled", "skipped"].includes(item.status));
  const completedTaskIds = unique([
    ...observation.completedTaskIds,
    ...completedItems.flatMap((item) => item.taskId ? [item.taskId] : [])
  ]);
  const incompleteTaskIds = unique([
    ...incompleteItems.flatMap((item) => item.taskId && item.taskStatus !== "DONE" ? [item.taskId] : []),
    ...observation.taskOutcomes.flatMap((item) => ["INBOX", "PLANNED", "IN_PROGRESS", "BLOCKED", "WAITING_FOR_USER"].includes(item.status)
      ? [item.taskId] : [])
  ]);
  const blockedTaskIds = unique(observation.blockedTaskIds);
  const plannedMinutes = actionable.reduce((sum, item) => sum + item.plannedMinutes, 0);
  return {
    date,
    completedTaskIds,
    incompleteTaskIds,
    blockedTaskIds,
    plannedItemCount: actionable.length,
    completedItemCount: completedItems.length,
    incompleteItemCount: incompleteItems.length,
    plannedMinutes,
    actualMinutes: observation.actualFocusMinutes,
    varianceMinutes: observation.actualFocusMinutes - plannedMinutes,
    replanCount: observation.replanCount,
    recurringActivityStatus: observation.recurringActivityStatus,
    carryoverTaskIds: incompleteTaskIds,
    taskOutcomes: observation.taskOutcomes,
    closedAt: closedAt.toISOString()
  };
};

const duration = (minutes: number): string => {
  const absolute = Math.abs(minutes);
  if (absolute < 60) return `${absolute}분`;
  return absolute % 60 === 0 ? `${absolute / 60}시간` : `${Math.floor(absolute / 60)}시간 ${absolute % 60}분`;
};

const formatSummary = (result: DayCloseResult): string => {
  const comparison = result.varianceMinutes === 0
    ? "계획과 같아"
    : result.varianceMinutes > 0 ? `${duration(result.varianceMinutes)} 초과` : `${duration(result.varianceMinutes)} 미달`;
  const carryoverNames = result.carryoverTaskIds.map((id) => result.taskOutcomes.find((item) => item.taskId === id)?.title).filter((value): value is string => Boolean(value));
  const incompleteRoutines = result.recurringActivityStatus.filter((item) => !item.completed).map((item) => item.title);
  const tomorrow = [...new Set([...carryoverNames, ...incompleteRoutines])];
  return [
    "오늘은 여기까지 정리했어.",
    "",
    `완료 ${result.completedItemCount}개 · 미완료 ${result.incompleteItemCount}개`,
    `집중 ${duration(result.actualMinutes)} / 계획 ${duration(result.plannedMinutes)} · ${comparison}`,
    `일정 조정 ${result.replanCount}회`,
    ...(tomorrow.length > 0 ? ["", "내일 다시 볼 것", "", ...tomorrow.map((title) => `- ${title}`)] : []),
    "",
    "오늘 기록은 저장해둘게. 내일 일어나면 최신 일정 기준으로 다시 짤게."
  ].join("\n");
};

export class DayCloseService implements DayCloseMessageHandler {
  private readonly repository: DayCloseServiceDependencies["repository"];
  private readonly clock: DayCloseServiceDependencies["clock"];
  private readonly wakeFollowUp: DayCloseServiceDependencies["wakeFollowUp"];

  constructor(dependencies: DayCloseServiceDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
    this.wakeFollowUp = dependencies.wakeFollowUp;
  }

  async handleDayCloseMessage(message: DayCloseMessage): Promise<DayCloseMessageResult> {
    const text = message.text.trim();
    const date = localDate(message.receivedAt, message.timeZone);
    let run = await this.repository.findWorkflow(message.userId, date);
    if (!run && !triggers.has(text)) return { handled: false };
    run ??= await this.repository.getOrCreateWorkflow(message.userId, date, message.timeZone, this.clock.now());
    if (run.status === "completed" && run.checkpoint.result) {
      return triggers.has(text) || run.checkpoint.lastMessageId === message.messageId
        ? { handled: true, reply: await this.withWakeFollowUp(formatSummary(run.checkpoint.result), message) }
        : { handled: false };
    }
    if (run.currentStep === "awaiting_focus_confirmation") {
      if (run.checkpoint.lastMessageId === message.messageId) return { handled: true, reply: FOCUS_GUARDRAIL };
      if (text === "아니" || text === "계속할게") return { handled: true, reply: "알겠어. 진행 중인 작업을 이어가자." };
      if (!confirmations.has(text)) return { handled: false };
      await this.repository.closeActiveFocus(run, message.messageId, this.clock.now());
      run = (await this.repository.findWorkflow(message.userId, date)) ?? run;
      return this.finish(run, message);
    }
    if (!triggers.has(text)) return { handled: false };
    if (await this.repository.hasActiveFocus(message.userId)) {
      await this.repository.awaitFocusConfirmation(run, message.messageId, this.clock.now());
      return { handled: true, reply: FOCUS_GUARDRAIL };
    }
    return this.finish(run, message);
  }

  private async finish(run: DayCloseWorkflowRun, message: DayCloseMessage): Promise<DayCloseMessageResult> {
    const observation = await this.repository.loadObservation(message.userId, run.checkpoint.date, message.timeZone);
    const now = this.clock.now();
    const calculated = calculateDayCloseResult(observation, run.checkpoint.date, now);
    const completed = await this.repository.complete(run, calculated, message.messageId, now);
    return { handled: true, reply: await this.withWakeFollowUp(formatSummary(completed.result), message) };
  }

  private async withWakeFollowUp(summary: string, message: DayCloseMessage): Promise<string> {
    try {
      const followUp = await this.wakeFollowUp?.afterDayClose(message);
      return followUp ? `${summary}\n\n${followUp}` : summary;
    } catch {
      return summary;
    }
  }
}
