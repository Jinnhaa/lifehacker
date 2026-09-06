import { FixedClock, type UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import type { MorningObservation } from "../morning/morning.js";
import type { Task } from "../task/task.js";
import type { ChiefContext, ChiefContextReader, ChiefRunRecorder } from "./chief.js";
import type { ProjectPmDelegator } from "./chief.js";
import type { ProjectPmReport } from "../project-pm/project-pm.js";
import { ChiefAgentService, isChiefRequest } from "./chief-service.js";

const userId = "20000000-0000-4000-8000-000000000001" as UserId;
const otherUserId = "20000000-0000-4000-8000-000000000002" as UserId;
const now = new Date("2026-09-05T03:00:00.000Z");

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "30000000-0000-4000-8000-000000000001" as Task["id"],
  userId,
  workContextId: null,
  objectiveId: null,
  title: "운영체제 과제",
  description: null,
  executionMode: "standard",
  officialDeadline: new Date("2026-09-05T13:00:00.000Z"),
  internalDeadline: null,
  estimatedMinutes: 45,
  estimatedUserMinutes: null,
  actualMinutes: 0,
  importance: 4,
  status: "PLANNED",
  nextAction: null,
  completionCriteria: null,
  completionSource: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  completedAt: null,
  updatedAt: now,
  ...overrides
});

const observation = (overrides: Partial<MorningObservation> = {}): MorningObservation => ({
  timeZone: "Asia/Seoul",
  planningBufferMinutes: 10,
  planningPolicy: {},
  constraints: [{
    id: "constraint-1", title: "수업", blocksCapacity: true, constraintType: "calendar_event",
    hardness: "fixed", origin: "calendar", start: new Date("2026-09-05T01:00:00.000Z"), end: new Date("2026-09-05T02:00:00.000Z")
  }],
  tasks: [task(), task({ id: "30000000-0000-4000-8000-000000000002" as Task["id"], title: "막힌 과제", status: "BLOCKED" })],
  recurringActivities: [],
  strategicDirectives: [],
  principles: [],
  carryoverContext: { sourceDate: "2026-09-04", taskIds: [], blockedTaskIds: [] },
  ...overrides
});

const context = (overrides: Partial<ChiefContext> = {}): ChiefContext => ({
  userId,
  observedAt: now,
  planDate: "2026-09-05",
  timeZone: "Asia/Seoul",
  observation: observation(),
  approvedPlan: { id: "plan-1", revisionNo: 1 },
  currentAction: null,
  activeFocus: null,
  replannedToday: false,
  weekStartsOn: 1,
  ...overrides
});

const message = (text: string, id = "discord:message-1", requestedUserId = userId) => ({
  userId: requestedUserId,
  timeZone: "Asia/Seoul",
  text,
  messageId: id,
  receivedAt: now
});

const serviceWith = (loaded: ChiefContext, recorder?: ChiefRunRecorder, projectPm?: ProjectPmDelegator) => {
  const reader: ChiefContextReader = { loadChiefContext: vi.fn(async () => loaded) };
  return {
    service: new ChiefAgentService({
      contextReader: reader,
      clock: new FixedClock(now),
      ...(recorder ? { runRecorder: recorder } : {}),
      ...(projectPm ? { projectPm } : {})
    }),
    reader
  };
};

describe("ChiefAgentService", () => {
  const projectReport: ProjectPmReport = {
    project: { id: "project-1", title: "LogFolio" },
    status: { open: 4, done: 2, inProgress: 1, blocked: 1, overdue: 0, dueSoon: 1 },
    nextAction: { taskId: "task-1", title: "발표 스크립트 수정", remainingMinutes: 45 },
    blockers: ["TAM 수치 검증"],
    nearestDeadline: { taskId: "task-2", title: "발표자료 수정", at: new Date("2026-09-08T12:00:00.000Z") },
    warnings: ["1개 일이 3일 안에 마감이야."]
  };

  it.each(["LogFolio 현황 봐줘", "NEXTiME 뭐 남았어?", "LogFolio에서 지금 뭐 해야 돼?", "LogFolio 프로젝트 상태 알려줘"])(
    "delegates the project request %s to Project PM",
    async (text) => {
      const projectPm: ProjectPmDelegator = { getProjectReport: vi.fn(async () => ({ handled: true, reply: "pm", report: projectReport })) };
      const { service, reader } = serviceWith(context(), undefined, projectPm);
      const result = await service.handleChiefMessage(message(text));
      expect(projectPm.getProjectReport).toHaveBeenCalledOnce();
      expect(result.reply).toContain("LogFolio PM에게 확인했어.");
      expect(reader.loadChiefContext).not.toHaveBeenCalled();
    }
  );

  it("reports only structured Project PM facts", async () => {
    const projectPm: ProjectPmDelegator = { getProjectReport: vi.fn(async () => ({ handled: true, reply: "raw", report: projectReport })) };
    const result = await serviceWith(context(), undefined, projectPm).service.handleChiefMessage(message("LogFolio 현황 봐줘"));
    expect(result.reply).toContain("남은 일 4개 · 진행 중 1개");
    expect(result.reply).toContain("가장 가까운 마감은 발표자료 수정 · 9/8이야.");
    expect(result.reply).toContain("발표 스크립트 수정부터 하는 게 좋아. 예상 45분이야.");
    expect(result.reply).toContain("TAM 수치 검증은 아직 막혀 있어.");
    expect(result.reply).not.toContain("NEXTiME");
  });

  it("forwards Project PM clarification without guessing", async () => {
    const projectPm: ProjectPmDelegator = {
      getProjectReport: vi.fn(async () => ({ handled: true, reply: "이름이 비슷한 프로젝트가 여러 개야. 정확한 이름을 알려줘." }))
    };
    await expect(serviceWith(context(), undefined, projectPm).service.handleChiefMessage(message("Log 현황 봐줘")))
      .resolves.toEqual({ handled: true, reply: "이름이 비슷한 프로젝트가 여러 개야. 정확한 이름을 알려줘." });
  });

  it("contains Project PM failures without crashing Chief", async () => {
    const projectPm: ProjectPmDelegator = { getProjectReport: vi.fn(async () => { throw new Error("internal"); }) };
    await expect(serviceWith(context(), undefined, projectPm).service.handleChiefMessage(message("LogFolio 현황 봐줘")))
      .resolves.toEqual({ handled: true, reply: "프로젝트 현황을 지금은 확인하지 못했어. 잠시 후 다시 물어봐줘." });
  });

  it("shares delegation correlation across PM and Chief traces with the same user", async () => {
    const recorder: ChiefRunRecorder = {
      findCompleted: vi.fn(async () => null),
      recordCompleted: vi.fn(async () => undefined),
      recordDelegationCompleted: vi.fn(async () => undefined)
    };
    const projectPm: ProjectPmDelegator = { getProjectReport: vi.fn(async () => ({ handled: true, reply: "pm", report: projectReport })) };
    await serviceWith(context(), recorder, projectPm).service.handleChiefMessage(message("LogFolio 현황 봐줘"));
    expect(projectPm.getProjectReport).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      correlationId: "chief-delegation:discord:message-1",
      source: "chief_delegation"
    }));
    expect(recorder.recordDelegationCompleted).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      correlationId: "chief-delegation:discord:message-1",
      report: projectReport
    }));
  });

  it.each(["오늘 상황 봐줘", "오늘 뭐 해야 돼?", "지금 뭐 해야 해?", "현황 알려줘", "뭐부터 할까?"])(
    "handles the explicit Chief request %s",
    async (text) => {
      const { service } = serviceWith(context());
      expect((await service.handleChiefMessage(message(text))).handled).toBe(true);
    }
  );

  it("handles status requests with deterministic Calendar and Task facts", async () => {
    const { service } = serviceWith(context({ replannedToday: true }));
    const result = await service.handleChiefMessage(message("오늘 상황 봐줘"));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("고정 일정 1개");
    expect(result.reply).toContain("남은 할 일 2개");
    expect(result.reply).toContain("마감 임박 2개");
    expect(result.reply).toContain("막힌 일 1개");
    expect(result.reply).toContain("오늘 일정 조정됨");
    expect(result.reply).not.toContain("score");
  });

  it("keeps general Chief requests on the direct path", async () => {
    const projectPm: ProjectPmDelegator = { getProjectReport: vi.fn(async () => ({ handled: false })) };
    const { service, reader } = serviceWith(context(), undefined, projectPm);
    await service.handleChiefMessage(message("오늘 상황 봐줘"));
    expect(reader.loadChiefContext).toHaveBeenCalledOnce();
    expect(projectPm.getProjectReport).not.toHaveBeenCalled();
  });

  it("uses the derived Current Action without recommending another Task", async () => {
    const loaded = context({
      currentAction: { kind: "task", source: "focus_session", title: "데이터구조 복습", taskId: "current-task", planItemId: null }
    });
    const { service } = serviceWith(loaded);
    const result = await service.handleChiefMessage(message("지금 뭐 해야 해?"));
    expect(result.reply).toContain("데이터구조 복습");
    expect(result.reply).not.toContain("지금 할 일\n운영체제 과제");
  });

  it("uses an approved planning preference only when it changes an ambiguous priority", async () => {
    const recorder: ChiefRunRecorder = {
      findCompleted: vi.fn(async () => null),
      recordCompleted: vi.fn(async () => undefined)
    };
    const loaded = context({ observation: observation({
      tasks: [task({ importance: 3 })],
      recurringActivities: [{
        id: "routine-1", title: "장기 루틴", targetCount: 3, completedCount: 0, expectedMinutes: 30,
        minimumMinutes: null, preferredDays: [5, 6, 7], importance: 5, occurrenceId: null
      }],
      principles: [{
        id: "principle-1", statement: "마감 우선", origin: "pattern_observed", decisionType: "priority",
        situationType: "deadline", choiceAction: "prioritize", consistencyKind: "outcome", consistencyValue: "done",
        applicationPolicy: "deadline_over_routine"
      }]
    }) });
    const { service } = serviceWith(loaded, recorder);
    const result = await service.handleChiefMessage(message("뭐부터 할까?"));
    expect(result.reply).toContain("운영체제 과제");
    expect(result.reply).toContain("이전에 승인한 기준대로");
    expect(recorder.recordCompleted).toHaveBeenCalledWith(expect.objectContaining({ usedPrincipleIds: ["principle-1"] }));
  });

  it("keeps user identity scoped through the context read", async () => {
    const { service, reader } = serviceWith(context({ userId: otherUserId }));
    await service.handleChiefMessage(message("현황 알려줘", "discord:other", otherUserId));
    expect(reader.loadChiefContext).toHaveBeenCalledWith(otherUserId, "2026-09-05", "Asia/Seoul", now);
  });

  it("rejects a context returned for another user", async () => {
    const { service } = serviceWith(context({ userId: otherUserId }));
    await expect(service.handleChiefMessage(message("현황 알려줘"))).rejects.toThrow("owner mismatch");
  });

  it("returns a recorded reply on retry without observing again", async () => {
    const recorder: ChiefRunRecorder = {
      findCompleted: vi.fn(async () => ({ reply: "기존 응답" })),
      recordCompleted: vi.fn(async () => undefined)
    };
    const { service, reader } = serviceWith(context(), recorder);
    await expect(service.handleChiefMessage(message("현황 알려줘"))).resolves.toEqual({ handled: true, reply: "기존 응답" });
    expect(reader.loadChiefContext).not.toHaveBeenCalled();
    expect(recorder.recordCompleted).not.toHaveBeenCalled();
  });

  it.each(["일어남", "시작", "완료", "막혔어", "다시 짜줘", "오늘 끝", "내일 8시에 깨워줘", "내일까지 과제 해야 해"])(
    "does not intercept %s",
    async (text) => {
      const { service, reader } = serviceWith(context());
      await expect(service.handleChiefMessage(message(text))).resolves.toEqual({ handled: false });
      expect(reader.loadChiefContext).not.toHaveBeenCalled();
      expect(isChiefRequest(text)).toBe(false);
    }
  );
});
