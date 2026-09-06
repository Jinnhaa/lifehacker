import { isDueWithin, isOverdue } from "../rules/deadline.js";
import type { Task } from "../task/task.js";
import type {
  ProjectPmContext,
  ProjectPmMessage,
  ProjectPmMessageHandler,
  ProjectPmMessageResult,
  ProjectPmReport,
  ProjectPmReportRequest,
  ProjectPmRequestKind,
  ProjectPmServiceDependencies,
  ProjectWorkContext
} from "./project-pm.js";

export interface ParsedProjectRequest {
  readonly projectName: string;
  readonly kind: ProjectPmRequestKind;
}

const REQUEST_PATTERNS: readonly { pattern: RegExp; kind: ProjectPmRequestKind }[] = [
  { pattern: /^(.+?)\s+현황\s*봐줘[?.!]?$/, kind: "status" },
  { pattern: /^(.+?)\s+뭐\s*남았어[?.!]?$/, kind: "status" },
  { pattern: /^(.+?)\s+프로젝트\s+상태\s*알려줘[?.!]?$/, kind: "status" },
  { pattern: /^(.+?)에서\s+지금\s+뭐\s*해야\s*돼[?.!]?$/, kind: "next_action" }
];

export const parseProjectPmRequest = (text: string): ParsedProjectRequest | null => {
  const normalized = text.trim().replace(/\s+/g, " ");
  for (const entry of REQUEST_PATTERNS) {
    const match = entry.pattern.exec(normalized);
    if (match?.[1]) return { projectName: match[1].trim(), kind: entry.kind };
  }
  return null;
};

const normalizeName = (value: string): string => value.trim().toLocaleLowerCase("ko-KR");

const selectProject = (projects: readonly ProjectWorkContext[], query: string): readonly ProjectWorkContext[] => {
  const normalized = normalizeName(query);
  const exact = projects.filter((project) => normalizeName(project.title) === normalized);
  if (exact.length > 0) return exact;
  return projects.filter((project) => normalizeName(project.title).includes(normalized));
};

const localDate = (value: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value);
  const field = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}`;
};

const deadline = (task: Task): Date | null => task.internalDeadline ?? task.officialDeadline;
const estimateRemaining = (task: Task): number | null => {
  const estimate = task.estimatedUserMinutes ?? task.estimatedMinutes;
  return estimate === null ? null : Math.max(estimate - task.actualMinutes, 0);
};
const actionable = (task: Task): boolean => !["DONE", "BLOCKED", "WAITING_FOR_USER"].includes(task.status);

const compareDeadline = (left: Task, right: Task): number =>
  (deadline(left)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (deadline(right)?.getTime() ?? Number.MAX_SAFE_INTEGER)
  || right.importance - left.importance
  || left.title.localeCompare(right.title);

const nextTask = (context: ProjectPmContext): Task | null => {
  if (context.activeFocus) {
    const focused = context.tasks.find((task) => task.id === context.activeFocus?.taskId && actionable(task));
    if (focused) return focused;
  }
  for (const item of context.approvedPlanTasks) {
    const planned = context.tasks.find((task) => task.id === item.taskId && actionable(task));
    if (planned) return planned;
  }
  const candidates = context.tasks.filter(actionable);
  const overdue = candidates.filter((task) => isOverdue(deadline(task), context.observedAt)).sort(compareDeadline);
  if (overdue[0]) return overdue[0];
  const dueSoon = candidates.filter((task) => isDueWithin(deadline(task), 3, context.observedAt, context.timeZone)).sort(compareDeadline);
  if (dueSoon[0]) return dueSoon[0];
  return [...candidates].sort((left, right) => right.importance - left.importance || compareDeadline(left, right))[0] ?? null;
};

const dateLabel = (value: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric", day: "numeric" }).formatToParts(value);
  const field = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("month")}/${field("day")}`;
};

const formatTask = (task: Task): string => {
  const minutes = estimateRemaining(task);
  return minutes !== null ? `${task.nextAction ?? task.title} · 예상 ${minutes}분` : task.nextAction ?? task.title;
};

const formatStatus = (context: ProjectPmContext): { reply: string; report: ProjectPmReport } => {
  const open = context.tasks.filter((task) => task.status !== "DONE");
  const done = context.tasks.filter((task) => task.status === "DONE");
  const inProgress = context.tasks.filter((task) => task.status === "IN_PROGRESS");
  const blocked = context.tasks.filter((task) => task.status === "BLOCKED");
  const overdue = open.filter((task) => isOverdue(deadline(task), context.observedAt));
  const dueSoon = open.filter((task) => !isOverdue(deadline(task), context.observedAt)
    && isDueWithin(deadline(task), 3, context.observedAt, context.timeZone));
  const nearest = [...open].filter((task) => deadline(task) !== null).sort(compareDeadline)[0] ?? null;
  const selected = nextTask(context);
  const warnings = [
    ...(overdue.length > 0 ? [`${overdue.length}개 일이 마감을 지났어.`] : []),
    ...(dueSoon.length > 0 ? [`${dueSoon.length}개 일이 3일 안에 마감이야.`] : [])
  ];
  const report: ProjectPmReport = {
    project: { id: context.project.id, title: context.project.title },
    status: {
      open: open.length, done: done.length, inProgress: inProgress.length, blocked: blocked.length,
      overdue: overdue.length, dueSoon: dueSoon.length
    },
    nextAction: selected ? {
      taskId: selected.id,
      title: selected.nextAction ?? selected.title,
      remainingMinutes: estimateRemaining(selected)
    } : null,
    blockers: blocked.map((task) => task.title),
    nearestDeadline: nearest ? { taskId: nearest.id, title: nearest.title, at: deadline(nearest)! } : null,
    warnings
  };
  const lines = [
    `${context.project.title} 현황`, "",
    `진행 중 ${inProgress.length} · 남은 일 ${open.length} · 완료 ${done.length} · 막힘 ${blocked.length}`,
    `마감 지남 ${overdue.length} · 마감 임박 ${dueSoon.length}`
  ];
  if (nearest) lines.push(`가장 가까운 마감: ${nearest.title} · ${dateLabel(deadline(nearest)!, context.timeZone)}`);
  lines.push("", "지금 할 일", selected ? formatTask(selected) : "지금 바로 진행할 수 있는 일은 없어.");
  if (blocked.length > 0) lines.push("", "막힌 일", ...blocked.slice(0, 3).map((task) => task.title));
  return { reply: lines.join("\n"), report };
};

export class ProjectPmService implements ProjectPmMessageHandler {
  constructor(private readonly dependencies: ProjectPmServiceDependencies) {}

  async handleProjectPmMessage(message: ProjectPmMessage): Promise<ProjectPmMessageResult> {
    const request = parseProjectPmRequest(message.text);
    if (!request) return { handled: false };
    return this.getProjectReport({
      userId: message.userId,
      timeZone: message.timeZone,
      projectName: request.projectName,
      requestKind: request.kind,
      triggerId: message.messageId,
      source: "discord",
      receivedAt: message.receivedAt
    });
  }

  async getProjectReport(request: ProjectPmReportRequest): Promise<ProjectPmMessageResult> {
    const previous = request.source === "chief_delegation"
      ? null
      : await this.findPrevious(request.userId, request.triggerId);
    if (previous) return { handled: true, reply: previous };
    const projects = await this.dependencies.repository.listProjects(request.userId);
    const matches = selectProject(projects, request.projectName);
    if (matches.length === 0) return { handled: true, reply: "프로젝트를 찾지 못했어. 정확한 이름을 알려줘." };
    if (matches.length > 1) return { handled: true, reply: "이름이 비슷한 프로젝트가 여러 개야. 정확한 이름을 알려줘." };

    const startedAt = this.dependencies.clock.now();
    const context = await this.dependencies.repository.loadProjectContext(
      request.userId, matches[0]!, localDate(request.receivedAt, request.timeZone), request.timeZone, startedAt
    );
    if (context.userId !== request.userId || context.project.userId !== request.userId) {
      throw new Error("Project PM context owner mismatch");
    }
    const result = formatStatus(context);
    try {
      await this.dependencies.runRecorder?.recordCompleted({
        context,
        requestKind: request.requestKind,
        triggerId: request.triggerId,
        source: request.source,
        reply: result.reply,
        nextTaskId: result.report.nextAction?.taskId ?? null,
        ...(request.correlationId ? { correlationId: request.correlationId } : {}),
        startedAt,
        completedAt: this.dependencies.clock.now()
      });
    } catch {
      // Execution trace is best-effort and must not block a read-only project report.
    }
    return { handled: true, reply: result.reply, report: result.report };
  }

  private async findPrevious(userId: ProjectPmReportRequest["userId"], triggerId: string): Promise<string | null> {
    try {
      return await this.dependencies.runRecorder?.findCompleted(userId, triggerId) ?? null;
    } catch {
      return null;
    }
  }
}

export const isProjectPmRequest = (text: string): boolean => parseProjectPmRequest(text) !== null;
