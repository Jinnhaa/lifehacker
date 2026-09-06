import { getDaysUntilDeadline, isDueWithin, isOverdue } from "../rules/deadline.js";
import { calculateRecurringActivityRisk, type RecurringActivityRisk } from "../rules/recurring-activity.js";
import { applyApprovedPrinciples, type PlanningPriorityCandidate } from "../principle-application/principle-application.js";
import { parseProjectPmRequest } from "../project-pm/project-pm-service.js";
import type { ProjectPmReport } from "../project-pm/project-pm.js";
import type { Task } from "../task/task.js";
import type {
  ChiefContext,
  ChiefMessage,
  ChiefMessageHandler,
  ChiefMessageResult,
  ChiefRequestKind,
  ChiefServiceDependencies
} from "./chief.js";

const STATUS_REQUESTS = new Set(["오늘 상황 봐줘", "현황 알려줘"]);
const NEXT_ACTION_REQUESTS = new Set(["오늘 뭐 해야 돼?", "오늘 뭐 해야 돼", "지금 뭐 해야 해?", "지금 뭐 해야 해", "뭐부터 할까?", "뭐부터 할까"]);

const requestKind = (text: string): ChiefRequestKind | null => {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (STATUS_REQUESTS.has(normalized)) return "status";
  if (NEXT_ACTION_REQUESTS.has(normalized)) return "next_action";
  return null;
};

const localDate = (value: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value);
  const field = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}`;
};

const localWeekday = (value: Date, timeZone: string): number => {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as const)[weekday as "Mon"] ?? 1;
};

const taskDeadline = (task: Task): Date | null => task.internalDeadline ?? task.officialDeadline;

const remainingSuitableDays = (
  preferredDays: readonly number[] | null,
  now: Date,
  timeZone: string,
  weekStartsOn: number
): number => {
  const today = localWeekday(now, timeZone);
  const weekEnd = ((weekStartsOn + 5) % 7) + 1;
  const daysRemaining = ((weekEnd - today + 7) % 7) + 1;
  const suitable = preferredDays && preferredDays.length > 0 ? new Set(preferredDays) : new Set([1, 2, 3, 4, 5, 6, 7]);
  let count = 0;
  for (let offset = 0; offset < daysRemaining; offset += 1) {
    const day = ((today - 1 + offset) % 7) + 1;
    if (suitable.has(day)) count += 1;
  }
  return count;
};

interface RoutineRisk {
  readonly id: string;
  readonly title: string;
  readonly importance: number;
  readonly expectedMinutes: number;
  readonly risk: RecurringActivityRisk;
}

const routineRisks = (context: ChiefContext): RoutineRisk[] => context.observation.recurringActivities.flatMap((activity) => {
  const result = calculateRecurringActivityRisk({
    targetCount: activity.targetCount,
    completedCount: activity.completedCount,
    remainingSuitableDays: remainingSuitableDays(activity.preferredDays, context.observedAt, context.timeZone, context.weekStartsOn)
  });
  return result.remainingCount > 0
    ? [{ id: activity.id, title: activity.title, importance: activity.importance, expectedMinutes: activity.expectedMinutes, risk: result.risk }]
    : [];
});

interface ChiefCandidate extends PlanningPriorityCandidate {
  readonly estimatedMinutes: number | null;
}

const taskRank = (task: Task, context: ChiefContext): number => {
  const deadline = taskDeadline(task);
  if (isOverdue(deadline, context.observedAt)) return 1;
  const days = getDaysUntilDeadline(deadline, context.observedAt, context.timeZone);
  if (days !== null && days <= 3) return 2;
  if (task.importance >= 4) return 3;
  return 6;
};

const candidates = (context: ChiefContext, risks: readonly RoutineRisk[]) => {
  const items: ChiefCandidate[] = [
    ...context.observation.tasks.filter((task) => task.status !== "BLOCKED").map((task) => ({
      type: "task" as const,
      id: task.id,
      rank: taskRank(task, context),
      importance: task.importance,
      deadline: taskDeadline(task),
      title: task.nextAction ?? task.title,
      estimatedMinutes: task.estimatedUserMinutes ?? task.estimatedMinutes
    })),
    ...risks.filter((activity) => activity.risk !== "LOW").map((activity) => ({
      type: "routine" as const,
      id: activity.id,
      rank: activity.risk === "HIGH" ? 2 : 4,
      importance: activity.importance,
      deadline: null,
      title: activity.title,
      estimatedMinutes: activity.expectedMinutes
    }))
  ];
  return applyApprovedPrinciples(items, context.observation.principles ?? [], context.observedAt, context.timeZone);
};

const actionLine = (title: string, minutes: number | null): string =>
  minutes && minutes > 0 ? `${title} · 예상 ${minutes}분` : title;

const projectDateLabel = (value: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric", day: "numeric" }).formatToParts(value);
  const field = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("month")}/${field("day")}`;
};

const formatDelegatedProject = (report: ProjectPmReport, timeZone: string): string => {
  const lines = [
    `${report.project.title} PM에게 확인했어.`, "",
    `남은 일 ${report.status.open}개 · 진행 중 ${report.status.inProgress}개`
  ];
  if (report.nearestDeadline) {
    lines.push(`가장 가까운 마감은 ${report.nearestDeadline.title} · ${projectDateLabel(report.nearestDeadline.at, timeZone)}이야.`);
  }
  lines.push("", report.nextAction
    ? `지금은 ${report.nextAction.title}부터 하는 게 좋아.${report.nextAction.remainingMinutes !== null ? ` 예상 ${report.nextAction.remainingMinutes}분이야.` : ""}`
    : "지금 바로 진행할 수 있는 일은 없어.");
  if (report.blockers.length > 0) lines.push(`${report.blockers.slice(0, 3).join(", ")}은 아직 막혀 있어.`);
  if (report.warnings.length > 0) lines.push("", "주의", ...report.warnings);
  return lines.join("\n");
};

const currentActionSelection = (context: ChiefContext): { title: string; estimatedMinutes: number | null } | null => {
  const action = context.currentAction;
  if (!action) return null;
  if (action.kind === "task") {
    const task = context.observation.tasks.find((item) => item.id === action.taskId);
    return { title: action.title, estimatedMinutes: task?.estimatedUserMinutes ?? task?.estimatedMinutes ?? null };
  }
  const activity = context.observation.recurringActivities.find((item) => item.occurrenceId === action.activityOccurrenceId);
  return { title: action.title, estimatedMinutes: activity?.expectedMinutes ?? null };
};

const urgentWarning = (context: ChiefContext): string | null => {
  const task = [...context.observation.tasks]
    .filter((item) => taskDeadline(item) !== null && (isOverdue(taskDeadline(item), context.observedAt) || isDueWithin(taskDeadline(item), 0, context.observedAt, context.timeZone)))
    .sort((left, right) => taskDeadline(left)!.getTime() - taskDeadline(right)!.getTime())[0];
  if (!task) return null;
  const deadline = taskDeadline(task)!;
  if (isOverdue(deadline, context.observedAt)) return `${task.title} 마감이 지났어.`;
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: context.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(deadline);
  return `${task.title}이 오늘 ${time} 마감이야.`;
};

const buildReply = (context: ChiefContext, kind: ChiefRequestKind): { reply: string; usedPrincipleIds: readonly string[] } => {
  const overdue = context.observation.tasks.filter((task) => isOverdue(taskDeadline(task), context.observedAt));
  const dueSoon = context.observation.tasks.filter((task) => !isOverdue(taskDeadline(task), context.observedAt)
    && isDueWithin(taskDeadline(task), 3, context.observedAt, context.timeZone));
  const blocked = context.observation.tasks.filter((task) => task.status === "BLOCKED");
  const risks = routineRisks(context);
  const ranked = candidates(context, risks);
  const selected = currentActionSelection(context) ?? ranked.candidates[0] ?? null;
  const usedPrincipleIds = context.currentAction ? [] : ranked.usedPrincipleIds;
  const warning = urgentWarning(context);
  const principleExplanation = usedPrincipleIds.length > 0 ? ranked.explanation?.replace("Task", "일") ?? null : null;

  if (kind === "next_action") {
    const lines = ["지금 할 일", selected ? actionLine(selected.title, selected.estimatedMinutes) : "지금 바로 시작할 일은 없어."];
    if (warning) lines.push("", "주의", warning);
    if (principleExplanation) lines.push("", principleExplanation);
    return { reply: lines.join("\n"), usedPrincipleIds };
  }

  const fixedCount = context.observation.constraints.filter((constraint) => constraint.blocksCapacity).length;
  const lines = [
    "오늘 상황", "",
    `- 고정 일정 ${fixedCount}개`,
    `- 남은 할 일 ${context.observation.tasks.length}개`,
    `- 마감 임박 ${dueSoon.length + overdue.length}개`,
    `- 막힌 일 ${blocked.length}개`
  ];
  if (context.replannedToday) lines.push("- 오늘 일정 조정됨");
  if (risks.some((risk) => risk.risk === "HIGH")) lines.push(`- 반복 활동 주의 ${risks.filter((risk) => risk.risk === "HIGH").length}개`);
  lines.push("", "지금 할 일", selected ? actionLine(selected.title, selected.estimatedMinutes) : "지금 바로 시작할 일은 없어.");
  if (warning) lines.push("", "주의", warning);
  if (principleExplanation) lines.push("", principleExplanation);
  return { reply: lines.join("\n"), usedPrincipleIds };
};

export class ChiefAgentService implements ChiefMessageHandler {
  constructor(private readonly dependencies: ChiefServiceDependencies) {}

  async handleChiefMessage(message: ChiefMessage): Promise<ChiefMessageResult> {
    const projectRequest = parseProjectPmRequest(message.text);
    if (projectRequest && this.dependencies.projectPm) return this.delegateProject(message, projectRequest);
    const kind = requestKind(message.text);
    if (!kind) return { handled: false };
    const previous = await this.findPrevious(message);
    if (previous) return { handled: true, reply: previous.reply };

    const startedAt = this.dependencies.clock.now();
    const context = await this.dependencies.contextReader.loadChiefContext(
      message.userId, localDate(message.receivedAt, message.timeZone), message.timeZone, startedAt
    );
    if (context.userId !== message.userId) throw new Error("Chief context owner mismatch");
    const result = buildReply(context, kind);
    try {
      await this.dependencies.runRecorder?.recordCompleted({
        context,
        requestKind: kind,
        triggerId: message.messageId,
        source: "discord",
        reply: result.reply,
        usedPrincipleIds: result.usedPrincipleIds,
        startedAt,
        completedAt: this.dependencies.clock.now()
      });
    } catch {
      // Execution trace is best-effort and must not block a read-only status request.
    }
    return { handled: true, reply: result.reply };
  }

  private async delegateProject(
    message: ChiefMessage,
    request: NonNullable<ReturnType<typeof parseProjectPmRequest>>
  ): Promise<ChiefMessageResult> {
    const previous = await this.findPrevious(message);
    if (previous) return { handled: true, reply: previous.reply };
    const startedAt = this.dependencies.clock.now();
    const correlationId = `chief-delegation:${message.messageId}`;
    try {
      const result = await this.dependencies.projectPm!.getProjectReport({
        userId: message.userId,
        timeZone: message.timeZone,
        projectName: request.projectName,
        requestKind: request.kind,
        triggerId: `${message.messageId}:project-pm`,
        source: "chief_delegation",
        receivedAt: message.receivedAt,
        correlationId
      });
      if (!result.report) return { handled: true, reply: result.reply ?? "어느 프로젝트를 확인할지 정확한 이름을 알려줘." };
      const reply = formatDelegatedProject(result.report, message.timeZone);
      try {
        await this.dependencies.runRecorder?.recordDelegationCompleted?.({
          userId: message.userId,
          triggerId: message.messageId,
          source: "discord",
          correlationId,
          report: result.report,
          reply,
          startedAt,
          completedAt: this.dependencies.clock.now()
        });
      } catch {
        // Delegation trace is best-effort and must not block the read-only result.
      }
      return { handled: true, reply };
    } catch {
      return { handled: true, reply: "프로젝트 현황을 지금은 확인하지 못했어. 잠시 후 다시 물어봐줘." };
    }
  }

  private async findPrevious(message: ChiefMessage) {
    try {
      return await this.dependencies.runRecorder?.findCompleted(message.userId, message.messageId) ?? null;
    } catch {
      return null;
    }
  }
}

export const isChiefRequest = (text: string): boolean => requestKind(text) !== null || parseProjectPmRequest(text) !== null;
