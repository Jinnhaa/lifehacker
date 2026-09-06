import { isDueWithin, isOverdue } from "../rules/deadline.js";
const REQUEST_PATTERNS = [
    { pattern: /^(.+?)\s+현황\s*봐줘[?.!]?$/, kind: "status" },
    { pattern: /^(.+?)\s+뭐\s*남았어[?.!]?$/, kind: "status" },
    { pattern: /^(.+?)\s+프로젝트\s+상태\s*알려줘[?.!]?$/, kind: "status" },
    { pattern: /^(.+?)에서\s+지금\s+뭐\s*해야\s*돼[?.!]?$/, kind: "next_action" }
];
const parseRequest = (text) => {
    const normalized = text.trim().replace(/\s+/g, " ");
    for (const entry of REQUEST_PATTERNS) {
        const match = entry.pattern.exec(normalized);
        if (match?.[1])
            return { projectName: match[1].trim(), kind: entry.kind };
    }
    return null;
};
const normalizeName = (value) => value.trim().toLocaleLowerCase("ko-KR");
const selectProject = (projects, query) => {
    const normalized = normalizeName(query);
    const exact = projects.filter((project) => normalizeName(project.title) === normalized);
    if (exact.length > 0)
        return exact;
    return projects.filter((project) => normalizeName(project.title).includes(normalized));
};
const localDate = (value, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(value);
    const field = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${field("year")}-${field("month")}-${field("day")}`;
};
const deadline = (task) => task.internalDeadline ?? task.officialDeadline;
const estimateRemaining = (task) => {
    const estimate = task.estimatedUserMinutes ?? task.estimatedMinutes;
    return estimate === null ? null : Math.max(estimate - task.actualMinutes, 0);
};
const actionable = (task) => !["DONE", "BLOCKED", "WAITING_FOR_USER"].includes(task.status);
const compareDeadline = (left, right) => (deadline(left)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (deadline(right)?.getTime() ?? Number.MAX_SAFE_INTEGER)
    || right.importance - left.importance
    || left.title.localeCompare(right.title);
const nextTask = (context) => {
    if (context.activeFocus) {
        const focused = context.tasks.find((task) => task.id === context.activeFocus?.taskId && actionable(task));
        if (focused)
            return focused;
    }
    for (const item of context.approvedPlanTasks) {
        const planned = context.tasks.find((task) => task.id === item.taskId && actionable(task));
        if (planned)
            return planned;
    }
    const candidates = context.tasks.filter(actionable);
    const overdue = candidates.filter((task) => isOverdue(deadline(task), context.observedAt)).sort(compareDeadline);
    if (overdue[0])
        return overdue[0];
    const dueSoon = candidates.filter((task) => isDueWithin(deadline(task), 3, context.observedAt, context.timeZone)).sort(compareDeadline);
    if (dueSoon[0])
        return dueSoon[0];
    return [...candidates].sort((left, right) => right.importance - left.importance || compareDeadline(left, right))[0] ?? null;
};
const dateLabel = (value, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric", day: "numeric" }).formatToParts(value);
    const field = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${field("month")}/${field("day")}`;
};
const formatTask = (task) => {
    const minutes = estimateRemaining(task);
    return minutes !== null ? `${task.nextAction ?? task.title} · 예상 ${minutes}분` : task.nextAction ?? task.title;
};
const formatStatus = (context) => {
    const open = context.tasks.filter((task) => task.status !== "DONE");
    const done = context.tasks.filter((task) => task.status === "DONE");
    const inProgress = context.tasks.filter((task) => task.status === "IN_PROGRESS");
    const blocked = context.tasks.filter((task) => task.status === "BLOCKED");
    const overdue = open.filter((task) => isOverdue(deadline(task), context.observedAt));
    const dueSoon = open.filter((task) => !isOverdue(deadline(task), context.observedAt)
        && isDueWithin(deadline(task), 3, context.observedAt, context.timeZone));
    const nearest = [...open].filter((task) => deadline(task) !== null).sort(compareDeadline)[0] ?? null;
    const selected = nextTask(context);
    const lines = [
        `${context.project.title} 현황`, "",
        `진행 중 ${inProgress.length} · 남은 일 ${open.length} · 완료 ${done.length} · 막힘 ${blocked.length}`,
        `마감 지남 ${overdue.length} · 마감 임박 ${dueSoon.length}`
    ];
    if (nearest)
        lines.push(`가장 가까운 마감: ${nearest.title} · ${dateLabel(deadline(nearest), context.timeZone)}`);
    lines.push("", "지금 할 일", selected ? formatTask(selected) : "지금 바로 진행할 수 있는 일은 없어.");
    if (blocked.length > 0)
        lines.push("", "막힌 일", ...blocked.slice(0, 3).map((task) => task.title));
    return { reply: lines.join("\n"), nextTaskId: selected?.id ?? null };
};
export class ProjectPmService {
    dependencies;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async handleProjectPmMessage(message) {
        const request = parseRequest(message.text);
        if (!request)
            return { handled: false };
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
    async getProjectReport(request) {
        const previous = await this.findPrevious(request.userId, request.triggerId);
        if (previous)
            return { handled: true, reply: previous };
        const projects = await this.dependencies.repository.listProjects(request.userId);
        const matches = selectProject(projects, request.projectName);
        if (matches.length === 0)
            return { handled: true, reply: "프로젝트를 찾지 못했어. 정확한 이름을 알려줘." };
        if (matches.length > 1)
            return { handled: true, reply: "이름이 비슷한 프로젝트가 여러 개야. 정확한 이름을 알려줘." };
        const startedAt = this.dependencies.clock.now();
        const context = await this.dependencies.repository.loadProjectContext(request.userId, matches[0], localDate(request.receivedAt, request.timeZone), request.timeZone, startedAt);
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
                nextTaskId: result.nextTaskId,
                startedAt,
                completedAt: this.dependencies.clock.now()
            });
        }
        catch {
            // Execution trace is best-effort and must not block a read-only project report.
        }
        return { handled: true, reply: result.reply };
    }
    async findPrevious(userId, triggerId) {
        try {
            return await this.dependencies.runRecorder?.findCompleted(userId, triggerId) ?? null;
        }
        catch {
            return null;
        }
    }
}
export const isProjectPmRequest = (text) => parseRequest(text) !== null;
//# sourceMappingURL=project-pm-service.js.map