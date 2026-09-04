import { zonedDateTimeToUtc, type Clock } from "@amber/shared";
import { createMorningPlan } from "./morning-planner.js";
import type {
  CurrentAction,
  MorningCheckpoint,
  MorningMessage,
  MorningMessageHandler,
  MorningMessageResult,
  MorningObservation,
  MorningPlan,
  MorningRepository,
  MorningServiceDependencies,
  MorningWorkflowRun,
  TimeInterval
} from "./morning.js";

const CONTEXT_QUESTION = "오늘은 몇 시까지 할까? 컨디션이나 캘린더에 없는 일정이 있으면 같이 알려줘.";

const localParts = (value: Date, timeZone: string): Record<string, string> =>
  Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

const localDate = (value: Date, timeZone: string): string => {
  const parts = localParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const localWeekday = (value: Date, timeZone: string): number => {
  const weekday = localParts(value, timeZone).weekday;
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as const)[weekday as "Mon"] ?? 1;
};

const normalizeHour = (raw: number, marker: string | undefined): number => {
  if ((marker === "오후" || marker === "저녁") && raw < 12) return raw + 12;
  if (marker === "오전" && raw === 12) return 0;
  if (!marker && raw >= 1 && raw <= 7) return raw + 12;
  return raw;
};

const localTime = (planDate: string, timeZone: string, marker: string | undefined, hour: string, minute?: string): Date | null => {
  const normalized = normalizeHour(Number(hour), marker);
  const parsedMinute = Number(minute ?? 0);
  if (normalized < 0 || normalized > 23 || parsedMinute < 0 || parsedMinute > 59) return null;
  return zonedDateTimeToUtc(`${planDate}T${String(normalized).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}:00`, timeZone);
};

const parseContext = (text: string, checkpoint: MorningCheckpoint): MorningCheckpoint => {
  const rangePattern = /(오전|오후|저녁)?\s*(\d{1,2})(?::(\d{2}))?시?\s*(?:부터|[-~～])\s*(오전|오후|저녁)?\s*(\d{1,2})(?::(\d{2}))?시?/g;
  const privateIntervals: TimeInterval[] = [...(checkpoint.privateIntervals ?? [])];
  for (const match of text.matchAll(rangePattern)) {
    const start = localTime(checkpoint.planDate, checkpoint.timeZone, match[1], match[2]!, match[3]);
    const end = localTime(checkpoint.planDate, checkpoint.timeZone, match[4] ?? match[1], match[5]!, match[6]);
    if (start && end && end > start) privateIntervals.push({ start, end });
  }
  const withoutRanges = text.replace(rangePattern, " ");
  const until = /(오전|오후|저녁)?\s*(\d{1,2})(?::(\d{2}))?시?\s*까지/.exec(withoutRanges);
  const workUntil = until
    ? localTime(checkpoint.planDate, checkpoint.timeZone, until[1], until[2]!, until[3])?.toISOString()
    : checkpoint.workUntil;
  return {
    ...checkpoint,
    ...(workUntil ? { workUntil } : {}),
    contextReply: text,
    ...(privateIntervals.length > 0 ? { privateIntervals } : {})
  };
};

const configuredWorkUntil = (observation: MorningObservation, planDate: string): Date | null => {
  const value = observation.planningPolicy.defaultWorkUntil ?? observation.planningPolicy.workUntil;
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  return zonedDateTimeToUtc(`${planDate}T${value}:00`, observation.timeZone);
};

const timeLabel = (value: Date, timeZone: string): string => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(value);

const formatProposal = (plan: MorningPlan, timeZone: string): string => {
  const entries = [
    ...plan.items.map((item) => ({ start: item.start, text: `${timeLabel(item.start, timeZone)}–${timeLabel(item.end, timeZone)} ${item.title}` })),
    ...plan.fixedEvents.map((event) => ({ start: event.start, text: `${timeLabel(event.start, timeZone)}–${timeLabel(event.end, timeZone)} ${event.title ?? "고정 일정"}` }))
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
  const schedule = entries.length > 0 ? entries.map((entry) => entry.text).join("\n") : "배치할 수 있는 일이 없어.";
  const highlights = plan.highlights.length > 0 ? `\n\n오늘 핵심\n\n${plan.highlights.map((value) => `- ${value}`).join("\n")}` : "";
  return `오늘은 이렇게 가는 게 좋아 보여.\n\n${schedule}${highlights}\n\n“승인”이라고 보내면 시작할게.`;
};

const formatApproved = (action: CurrentAction | null): string =>
  action ? `오늘 계획을 승인했어. 첫 할 일은 ${action.title}이야.` : "오늘 계획을 승인했어. 지금 시작할 계획 항목은 없어.";

export class MorningWorkflowService implements MorningMessageHandler {
  private readonly repository: MorningRepository;
  private readonly clock: Clock;

  constructor(dependencies: MorningServiceDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
  }

  async handleMorningMessage(message: MorningMessage): Promise<MorningMessageResult> {
    const text = message.text.trim();
    const planDate = localDate(message.receivedAt, message.timeZone);
    if (text === "일어남") return this.start(message, planDate);

    const run = await this.repository.findTodayWorkflow(message.userId, planDate);
    if (!run) return { handled: false };
    if (run.checkpoint.lastMessageId === message.messageId) return this.resumeReply(message, run);
    if (text === "승인" && run.currentStep === "awaiting_approval") return this.approve(message, run);
    if (text === "승인" && run.currentStep === "completed") {
      const action = await this.repository.deriveCurrentAction(message.userId, planDate);
      return { handled: true, reply: formatApproved(action) };
    }
    if ((text === "다시 짜줘" || text.startsWith("수정:")) && run.currentStep === "awaiting_approval") {
      return this.revise(message, run);
    }
    if (run.currentStep === "awaiting_context") return this.receiveContext(message, run);
    return { handled: false };
  }

  private async resumeReply(message: MorningMessage, run: MorningWorkflowRun): Promise<MorningMessageResult> {
    if (run.currentStep === "awaiting_context") return { handled: true, reply: CONTEXT_QUESTION };
    if (run.currentStep === "awaiting_approval") {
      const proposal = await this.repository.getProposal(run);
      return proposal ? { handled: true, reply: formatProposal(proposal, message.timeZone) } : { handled: true, reply: CONTEXT_QUESTION };
    }
    if (run.currentStep === "completed") {
      const action = await this.repository.deriveCurrentAction(message.userId, run.checkpoint.planDate);
      return { handled: true, reply: formatApproved(action) };
    }
    return { handled: true, reply: CONTEXT_QUESTION };
  }

  private async start(message: MorningMessage, planDate: string): Promise<MorningMessageResult> {
    const run = await this.repository.getOrCreateWorkflow(message.userId, planDate, message.timeZone, message.receivedAt);
    if (run.currentStep === "awaiting_context") return { handled: true, reply: CONTEXT_QUESTION };
    if (run.currentStep === "awaiting_approval") {
      const proposal = await this.repository.getProposal(run);
      return proposal ? { handled: true, reply: formatProposal(proposal, message.timeZone) } : this.prepareProposal(message, run);
    }
    if (run.currentStep === "completed") {
      const action = await this.repository.deriveCurrentAction(message.userId, planDate);
      return { handled: true, reply: formatApproved(action) };
    }
    const observation = await this.repository.loadObservation(message.userId, planDate, message.timeZone, this.clock.now());
    const configured = configuredWorkUntil(observation, planDate);
    if (!configured) {
      await this.repository.updateCheckpoint(run, run.checkpoint, "awaiting_context", "waiting_for_user", this.clock.now(), message.messageId);
      return { handled: true, reply: CONTEXT_QUESTION };
    }
    const updated = await this.repository.updateCheckpoint(
      run, { ...run.checkpoint, workUntil: configured.toISOString() }, "observe", "running", this.clock.now(), message.messageId
    );
    return this.prepareProposal(message, updated, observation);
  }

  private async receiveContext(message: MorningMessage, run: MorningWorkflowRun): Promise<MorningMessageResult> {
    const checkpoint = parseContext(message.text, run.checkpoint);
    if (!checkpoint.workUntil) return { handled: true, reply: CONTEXT_QUESTION };
    const updated = await this.repository.updateCheckpoint(run, checkpoint, "observe", "running", this.clock.now(), message.messageId);
    return this.prepareProposal(message, updated);
  }

  private async revise(message: MorningMessage, run: MorningWorkflowRun): Promise<MorningMessageResult> {
    const observation = await this.repository.loadObservation(message.userId, run.checkpoint.planDate, message.timeZone, this.clock.now());
    const parsed = parseContext(message.text, run.checkpoint);
    const excludedTaskIds = observation.tasks
      .filter((task) => message.text.includes(task.title) && /(제외|빼)/.test(message.text))
      .map((task) => task.id);
    const checkpoint: MorningCheckpoint = {
      ...parsed,
      revisionRequest: message.text,
      excludedTaskIds: [...new Set([...(run.checkpoint.excludedTaskIds ?? []), ...excludedTaskIds])]
    };
    const updated = await this.repository.updateCheckpoint(run, checkpoint, "observe", "running", this.clock.now(), message.messageId);
    return this.prepareProposal(message, updated, observation);
  }

  private async prepareProposal(
    message: MorningMessage,
    run: MorningWorkflowRun,
    loaded?: MorningObservation
  ): Promise<MorningMessageResult> {
    const workUntil = run.checkpoint.workUntil ? new Date(run.checkpoint.workUntil) : null;
    if (!workUntil || Number.isNaN(workUntil.getTime())) return { handled: true, reply: CONTEXT_QUESTION };
    const source = loaded ?? await this.repository.loadObservation(
      message.userId, run.checkpoint.planDate, message.timeZone, this.clock.now()
    );
    const excluded = new Set(run.checkpoint.excludedTaskIds ?? []);
    const observation = { ...source, tasks: source.tasks.filter((task) => !excluded.has(task.id)) };
    const calculated = createMorningPlan({
      observation,
      now: this.clock.now(),
      workUntil,
      privateIntervals: run.checkpoint.privateIntervals ?? [],
      localWeekday: localWeekday(this.clock.now(), message.timeZone)
    });
    const draft = {
      ...calculated,
      inputSnapshot: {
        ...calculated.inputSnapshot,
        ...(run.checkpoint.contextReply ? { contextReply: run.checkpoint.contextReply } : {}),
        ...(run.checkpoint.revisionRequest ? { revisionRequest: run.checkpoint.revisionRequest } : {}),
        ...(run.checkpoint.excludedTaskIds ? { excludedTaskIds: run.checkpoint.excludedTaskIds } : {})
      }
    };
    const proposal = await this.repository.createProposal(run, draft, this.clock.now(), message.messageId);
    return { handled: true, reply: formatProposal(proposal, message.timeZone) };
  }

  private async approve(message: MorningMessage, run: MorningWorkflowRun): Promise<MorningMessageResult> {
    await this.repository.approve(run, this.clock.now(), message.messageId);
    const action = await this.repository.deriveCurrentAction(message.userId, run.checkpoint.planDate);
    return { handled: true, reply: formatApproved(action) };
  }
}
