import { FixedClock, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../task/task.js";
import type { ProjectPmContext, ProjectPmRepository, ProjectWorkContext } from "./project-pm.js";
import { isProjectPmRequest, ProjectPmService } from "./project-pm-service.js";

const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const otherUserId = "20000000-0000-4000-8000-000000000002" as UserId;
const now = new Date("2026-09-06T03:00:00.000Z");
const project = (overrides: Partial<ProjectWorkContext> = {}): ProjectWorkContext => ({
  id: "40000000-0000-4000-8000-000000000001",
  userId,
  scopeId: "50000000-0000-4000-8000-000000000001",
  title: "LogFolio",
  description: null,
  status: "active",
  startDate: null,
  endDate: null,
  ...overrides
});

const task = (id: string, title: string, overrides: Partial<Task> = {}): Task => ({
  id: id as Task["id"], userId, workContextId: project().id, objectiveId: null, title, description: null,
  executionMode: "standard", officialDeadline: null, internalDeadline: null, estimatedMinutes: 45,
  estimatedUserMinutes: null, actualMinutes: 0, importance: 3, status: "PLANNED", nextAction: null,
  completionCriteria: null, completionSource: null, createdAt: new Date("2026-09-01T00:00:00.000Z"),
  completedAt: null, updatedAt: now, ...overrides
});

const context = (overrides: Partial<ProjectPmContext> = {}): ProjectPmContext => ({
  userId,
  project: project(),
  observedAt: now,
  planDate: "2026-09-06",
  timeZone: "Asia/Seoul",
  objectives: [{ id: "objective-1", title: "출시", goalId: "goal-1", targetDate: "2026-09-10", importance: 5, status: "active" }],
  goals: [{ id: "goal-1", title: "포트폴리오", status: "active" }],
  tasks: [
    task("30000000-0000-4000-8000-000000000001", "발표 스크립트 수정", { status: "IN_PROGRESS", actualMinutes: 15 }),
    task("30000000-0000-4000-8000-000000000002", "TAM 수치 검증", { status: "BLOCKED" }),
    task("30000000-0000-4000-8000-000000000003", "완료한 일", { status: "DONE", completedAt: now })
  ],
  activeFocus: null,
  approvedPlanTasks: [],
  recentEvents: [],
  ...overrides
});

const message = (text: string, requestedUserId = userId) => ({
  userId: requestedUserId,
  timeZone: "Asia/Seoul",
  text,
  messageId: "discord:pm-1",
  receivedAt: now
});

const serviceWith = (projects: readonly ProjectWorkContext[], loaded = context()) => {
  const repository: ProjectPmRepository = {
    listProjects: vi.fn(async () => projects),
    loadProjectContext: vi.fn(async () => loaded)
  };
  return { service: new ProjectPmService({ repository, clock: new FixedClock(now) }), repository };
};

describe("ProjectPmService", () => {
  it.each(["LogFolio 현황 봐줘", "NEXTiME 뭐 남았어?", "LogFolio 프로젝트 상태 알려줘", "LogFolio에서 지금 뭐 해야 돼?"])(
    "recognizes the project request %s",
    (text) => expect(isProjectPmRequest(text)).toBe(true)
  );

  it("reports deterministic status for only the selected project", async () => {
    const { service } = serviceWith([project()]);
    const result = await service.handleProjectPmMessage(message("LogFolio 현황 봐줘"));
    expect(result.reply).toContain("LogFolio 현황");
    expect(result.reply).toContain("진행 중 1 · 남은 일 2 · 완료 1 · 막힘 1");
    expect(result.reply).toContain("발표 스크립트 수정 · 예상 30분");
    expect(result.reply).toContain("TAM 수치 검증");
    expect(result.reply).not.toContain("NEXTiME 비밀 작업");
  });

  it("asks for an exact name when the project is ambiguous or absent", async () => {
    const similar = [project(), project({ id: "project-2", title: "LogFolio Mobile" })];
    const ambiguous = serviceWith(similar);
    await expect(ambiguous.service.handleProjectPmMessage(message("Log 현황 봐줘")))
      .resolves.toEqual({ handled: true, reply: "이름이 비슷한 프로젝트가 여러 개야. 정확한 이름을 알려줘." });
    const absent = serviceWith([]);
    await expect(absent.service.handleProjectPmMessage(message("Unknown 현황 봐줘")))
      .resolves.toEqual({ handled: true, reply: "프로젝트를 찾지 못했어. 정확한 이름을 알려줘." });
  });

  it("prefers the active FocusSession in the selected project", async () => {
    const focused = task("focus-task", "집중 중인 일", { status: "IN_PROGRESS" });
    const overdue = task("overdue-task", "기한 지난 일", { officialDeadline: new Date("2026-09-05T03:00:00.000Z") });
    const loaded = context({
      tasks: [focused, overdue],
      activeFocus: { sessionId: "focus-1", taskId: focused.id, title: focused.title, startedAt: now }
    });
    const result = await serviceWith([project()], loaded).service.handleProjectPmMessage(message("LogFolio에서 지금 뭐 해야 돼?"));
    expect(result.reply).toContain("지금 할 일\n집중 중인 일");
  });

  it("prefers the first approved plan item before overdue tasks", async () => {
    const planned = task("planned-task", "계획에 있는 일");
    const overdue = task("overdue-task", "기한 지난 일", { officialDeadline: new Date("2026-09-05T03:00:00.000Z"), importance: 5 });
    const loaded = context({ tasks: [overdue, planned], approvedPlanTasks: [{ taskId: planned.id, position: 1 }] });
    const result = await serviceWith([project()], loaded).service.handleProjectPmMessage(message("LogFolio 뭐 남았어?"));
    expect(result.reply).toContain("지금 할 일\n계획에 있는 일");
  });

  it("never recommends a blocked task and calculates overdue and due-soon counts", async () => {
    const blocked = task("blocked", "막힌 일", { status: "BLOCKED", importance: 5 });
    const overdue = task("overdue", "기한 지난 일", { officialDeadline: new Date("2026-09-05T03:00:00.000Z") });
    const soon = task("soon", "곧 마감", { officialDeadline: new Date("2026-09-08T03:00:00.000Z") });
    const loaded = context({ tasks: [blocked, overdue, soon] });
    const result = await serviceWith([project()], loaded).service.handleProjectPmMessage(message("LogFolio 현황 봐줘"));
    expect(result.reply).toContain("마감 지남 1 · 마감 임박 1");
    expect(result.reply).toContain("지금 할 일\n기한 지난 일");
    expect(result.reply).not.toContain("지금 할 일\n막힌 일");
  });

  it.each(["오늘 뭐 해야 돼?", "오늘 상황 봐줘", "LogFolio 작업 해야 해"])("does not intercept %s", async (text) => {
    const { service, repository } = serviceWith([project()]);
    await expect(service.handleProjectPmMessage(message(text))).resolves.toEqual({ handled: false });
    expect(repository.listProjects).not.toHaveBeenCalled();
  });

  it("rejects cross-user context and preserves the requested user in repository reads", async () => {
    const foreign = context({ userId: otherUserId, project: project({ userId: otherUserId }) });
    const { service, repository } = serviceWith([project({ userId: otherUserId })], foreign);
    await expect(service.handleProjectPmMessage(message("LogFolio 현황 봐줘", userId))).rejects.toThrow("owner mismatch");
    expect(repository.listProjects).toHaveBeenCalledWith(userId);
  });
});
