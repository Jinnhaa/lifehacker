import { zonedDateTimeToUtc } from "@amber/shared";
import type {
  WakeDayCloseFollowUp,
  WakeMessage,
  WakeMessageHandler,
  WakeMessageResult,
  WakeServiceDependencies,
  WakeSource,
  WakeTargetContext,
  WakeWorkflowRun
} from "./wake.js";

const localParts = (value: Date, timeZone: string): Record<string, string> => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
);

const localDate = (value: Date, timeZone: string): string => {
  const parts = localParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const timeLabel = (value: Date, timeZone: string): string => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(value);

const parseClockTime = (text: string): { hour: number; minute: number } | null => {
  const match = /(?<!\d)(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(\d{1,2})\s*분)?)\s*(?:에)?(?!\d)/.exec(text);
  if (!match) return null;
  const rawHour = Number(match[2]);
  let hour = rawHour;
  const minute = Number(match[3] ?? match[4] ?? 0);
  if (match[1] && (rawHour < 1 || rawHour > 12)) return null;
  if (match[1] === "오후" && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
};

const parseSnoozeMinutes = (text: string): number | null => {
  if (/조금\s*있다가\s*깨워줘/.test(text)) return 10;
  const match = /(?:(10|20|30)\s*분\s*만|(10|20|30)\s*분\s*뒤(?:에)?)/.exec(text);
  return match ? Number(match[1] ?? match[2]) : null;
};

const isWakeIntent = (text: string): boolean => /(깨워\s*줘|일어날래)/.test(text);

const question = (context: WakeTargetContext, timeZone: string): string => context.firstConstraint
  ? `내일 첫 일정은 ${timeLabel(context.firstConstraint.start, timeZone)}${context.firstConstraint.title ? ` ${context.firstConstraint.title}` : ""}이야. 몇 시에 깨울까?`
  : "내일 몇 시에 깨울까?";

const scheduledReply = (run: WakeWorkflowRun): string => {
  const wakeAt = run.checkpoint.wakeAt ? new Date(run.checkpoint.wakeAt) : null;
  return wakeAt && !Number.isNaN(wakeAt.getTime())
    ? `알겠어. ${run.checkpoint.targetDate} ${timeLabel(wakeAt, run.checkpoint.timeZone)}에 깨울게.`
    : "깨울 시간을 다시 알려줘.";
};

export class WakeWorkflowService implements WakeMessageHandler, WakeDayCloseFollowUp {
  private readonly repository: WakeServiceDependencies["repository"];
  private readonly clock: WakeServiceDependencies["clock"];

  constructor(dependencies: WakeServiceDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
  }

  async afterDayClose(message: WakeMessage): Promise<string | null> {
    const targetDate = addDays(localDate(message.receivedAt, message.timeZone), 1);
    const existing = await this.repository.findWorkflow(message.userId, targetDate);
    if (existing?.currentStep === "scheduled") return scheduledReply(existing);
    if (existing?.currentStep === "acknowledged" || existing?.currentStep === "cancelled") return null;
    const context = await this.repository.loadTargetContext(message.userId, targetDate, message.timeZone);
    const run = existing ?? await this.repository.getOrCreateAwaitingWorkflow(
      message.userId, targetDate, message.timeZone, context, this.clock.now()
    );
    if (context.preferredWakeTime) {
      const wakeAt = zonedDateTimeToUtc(`${targetDate}T${context.preferredWakeTime}:00`, message.timeZone);
      const source: WakeSource = context.preferenceSource ?? "preference";
      return scheduledReply(await this.repository.schedule(run, wakeAt, source, `day-close:${message.messageId}`, this.clock.now()));
    }
    return question(context, message.timeZone);
  }

  async handleWakeMessage(message: WakeMessage): Promise<WakeMessageResult> {
    const text = message.text.trim();
    const today = localDate(message.receivedAt, message.timeZone);
    if (text === "일어남") {
      await this.repository.acknowledgeForDate(message.userId, today, message.messageId, this.clock.now());
      return { handled: false };
    }

    const snoozeMinutes = parseSnoozeMinutes(text);
    if (snoozeMinutes !== null) {
      const wakeAt = new Date(this.clock.now().getTime() + snoozeMinutes * 60_000);
      const scheduled = await this.repository.snooze(message.userId, today, wakeAt, message.messageId, this.clock.now());
      return scheduled
        ? { handled: true, reply: `${snoozeMinutes}분 뒤에 다시 깨울게.` }
        : { handled: true, reply: "오늘 보낸 깨우기 알림이 없어서 미룰 수 없어." };
    }

    const parsedTime = parseClockTime(text);
    const tomorrow = text.includes("내일");
    let targetDate = tomorrow ? addDays(today, 1) : today;
    let existing = await this.repository.findWorkflow(message.userId, targetDate);
    if (!tomorrow && !isWakeIntent(text) && parsedTime) {
      const nextDate = addDays(today, 1);
      const nextRun = await this.repository.findWorkflow(message.userId, nextDate);
      if (nextRun?.currentStep === "awaiting_time") {
        targetDate = nextDate;
        existing = nextRun;
      }
    }
    const awaitingReply = existing?.currentStep === "awaiting_time";
    if (!isWakeIntent(text) && !awaitingReply) return { handled: false };
    if (!parsedTime) return { handled: true, reply: "몇 시에 깨울지 시간을 알려줘." };
    const wakeAt = zonedDateTimeToUtc(
      `${targetDate}T${String(parsedTime.hour).padStart(2, "0")}:${String(parsedTime.minute).padStart(2, "0")}:00`,
      message.timeZone
    );
    if (wakeAt <= this.clock.now()) {
      return { handled: true, reply: "그 시간은 이미 지났어. 아직 지나지 않은 시간으로 다시 알려줘." };
    }
    const context = await this.repository.loadTargetContext(message.userId, targetDate, message.timeZone);
    const run = existing ?? await this.repository.getOrCreateAwaitingWorkflow(
      message.userId, targetDate, message.timeZone, context, this.clock.now()
    );
    return { handled: true, reply: scheduledReply(await this.repository.schedule(run, wakeAt, "user", message.messageId, this.clock.now())) };
  }
}
