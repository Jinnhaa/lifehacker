import { describe, expect, it } from "vitest";
import type { ActionCandidate } from "../candidates/action-candidate.js";
import type { WorldDailyCapacity, WorldModelSnapshot } from "../world-model/world-model.js";
import { decideChiefPriority } from "./chief-priority-engine.js";

const now = new Date("2026-10-05T03:00:00.000Z");
const atLocalDate = (date: string): Date => new Date(`${date}T03:00:00.000Z`);

const capacityDay = (date: string, availableMinutes = 120): WorldDailyCapacity => ({
  date,
  availableMinutes,
  blockedMinutes: 0,
  elapsedMinutes: 0,
  planningBufferMinutes: 0
});

const defaultFutureCapacity = [
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-09",
  "2026-10-10",
  "2026-10-11",
  "2026-10-12"
].map((date) => capacityDay(date));

const snapshot = (
  futureCapacity: readonly WorldDailyCapacity[] = defaultFutureCapacity,
  todayAvailableMinutes = 120
): WorldModelSnapshot => ({
  now,
  timeZone: "Asia/Seoul",
  contexts: { learning: [], projects: [] },
  tasks: [],
  execution: { completedToday: [], partialToday: [], skippedToday: [] },
  constraints: {
    calendarEvents: [],
    todayCapacity: {
      availableMinutes: todayAvailableMinutes,
      blockedMinutes: 0,
      elapsedMinutes: 0,
      planningBufferMinutes: 0
    },
    futureCapacity
  },
  risks: [],
  focus: { week: [], todayMustWin: null }
});

const candidate = (
  taskId: string,
  overrides: Partial<ActionCandidate> = {}
): ActionCandidate => ({
  taskId,
  title: taskId,
  taskType: "user",
  contextId: null,
  contextType: null,
  contextTitle: null,
  status: "INBOX",
  importance: 3,
  deadline: null,
  deadlineSource: null,
  estimatedMinutes: 60,
  remainingMinutes: 60,
  plannedDate: null,
  completionCriteria: null,
  contextEvidence: { commitmentLevel: null, strategicImportance: null },
  feasibility: { canFitToday: true },
  evidence: { overdue: false, worldRiskTypes: [] },
  ...overrides
});

const decide = (
  candidates: readonly ActionCandidate[],
  options: { readonly mustDoTaskIds?: readonly string[]; readonly snapshot?: WorldModelSnapshot } = {}
) => decideChiefPriority({
  snapshot: options.snapshot ?? snapshot(),
  candidates,
  ...(options.mustDoTaskIds === undefined ? {} : { mustDoTaskIds: options.mustDoTaskIds })
});

describe("decideChiefPriority", () => {
  it("returns an empty decision when there are no Candidates", () => {
    expect(decide([])).toEqual({ mainQuest: null, upNext: [] });
  });

  it("selects one Candidate as Main Quest", () => {
    const decision = decide([candidate("only")]);

    expect(decision.mainQuest?.taskId).toBe("only");
    expect(decision.upNext).toEqual([]);
    expect(decision.mainQuest).not.toHaveProperty("priorityScore");
  });

  it("selects at most one Main Quest and two Up Next choices", () => {
    const decision = decide([candidate("one"), candidate("two"), candidate("three"), candidate("four")]);

    expect(decision.mainQuest?.taskId).toBe("one");
    expect(decision.upNext.map((choice) => choice.taskId)).toEqual(["two", "three"]);
  });

  it("places explicit Must-do above overdue, importance, and strategic importance", () => {
    const decision = decide([
      candidate("overdue", { deadline: atLocalDate("2026-10-04"), importance: 5 }),
      candidate("strategic", { contextEvidence: { commitmentLevel: "REQUIRED", strategicImportance: 5 }, importance: 5 }),
      candidate("must", { importance: 1, feasibility: { canFitToday: false } })
    ], { mustDoTaskIds: ["must"] });

    expect(decision.mainQuest).toMatchObject({
      taskId: "must",
      reasonCodes: expect.arrayContaining(["USER_MUST_DO"]),
      evidence: { mustDo: true }
    });
    expect(decision.mainQuest?.whyNow).toBe("오늘 꼭 하기로 지정한 Task라서 가장 먼저 둡니다.");
  });

  it("uses the remaining hierarchy between multiple Must-do Tasks", () => {
    const decision = decide([
      candidate("lower", { importance: 1 }),
      candidate("higher", { importance: 5 }),
      candidate("non-must-overdue", { deadline: atLocalDate("2026-10-04") })
    ], { mustDoTaskIds: ["lower", "higher"] });

    expect(decision.mainQuest?.taskId).toBe("higher");
    expect(decision.upNext[0]?.taskId).toBe("lower");
  });

  it("orders overdue and due-today deadline danger before safer deadlines", () => {
    const decision = decide([
      candidate("future", { deadline: atLocalDate("2026-10-06") }),
      candidate("today", { deadline: atLocalDate("2026-10-05") }),
      candidate("overdue", { deadline: atLocalDate("2026-10-04") })
    ]);

    expect([decision.mainQuest, ...decision.upNext].map((choice) => choice?.taskId)).toEqual([
      "overdue",
      "today",
      "future"
    ]);
    expect(decision.mainQuest?.evidence.deadlineState).toBe("OVERDUE");
    expect(decision.upNext[0]?.evidence.deadlineState).toBe("DUE_TODAY");
  });

  it("classifies an expired same-day deadline as overdue", () => {
    const currentSnapshot = {
      ...snapshot(),
      now: new Date("2026-10-05T05:00:00.000Z") // 14:00 Asia/Seoul
    };
    const decision = decide([
      candidate("expired-today", { deadline: new Date("2026-10-05T01:00:00.000Z") }) // 10:00
    ], { snapshot: currentSnapshot });

    expect(decision.mainQuest).toMatchObject({
      taskId: "expired-today",
      reasonCodes: ["OVERDUE"],
      whyNow: "마감이 지난 Task라서 먼저 처리해야 합니다.",
      evidence: { deadlineState: "OVERDUE", deadlineDate: "2026-10-05" }
    });
  });

  it("classifies a non-expired same-day deadline as due today", () => {
    const currentSnapshot = {
      ...snapshot(),
      now: new Date("2026-10-05T05:00:00.000Z") // 14:00 Asia/Seoul
    };
    const decision = decide([
      candidate("due-later-today", { deadline: new Date("2026-10-05T09:00:00.000Z") }) // 18:00
    ], { snapshot: currentSnapshot });

    expect(decision.mainQuest).toMatchObject({
      taskId: "due-later-today",
      evidence: { deadlineState: "DUE_TODAY", deadlineDate: "2026-10-05" }
    });
  });

  it("ranks an expired same-day deadline above a non-expired due-today deadline", () => {
    const currentSnapshot = {
      ...snapshot(),
      now: new Date("2026-10-05T05:00:00.000Z")
    };
    const decision = decide([
      candidate("due-later-today", { deadline: new Date("2026-10-05T09:00:00.000Z") }),
      candidate("expired-today", { deadline: new Date("2026-10-05T01:00:00.000Z") })
    ], { snapshot: currentSnapshot });

    expect(decision.mainQuest?.taskId).toBe("expired-today");
    expect(decision.upNext[0]).toMatchObject({
      taskId: "due-later-today",
      evidence: { deadlineState: "DUE_TODAY", deadlineDate: "2026-10-05" }
    });
  });

  it("prioritizes a later unsafe deadline window above a nearer safe deadline", () => {
    const decision = decide([
      candidate("near-safe", { deadline: atLocalDate("2026-10-06"), remainingMinutes: 30 }),
      candidate("later-deficit", {
        deadline: atLocalDate("2026-10-09"),
        estimatedMinutes: 600,
        remainingMinutes: 600,
        feasibility: { canFitToday: false }
      })
    ]);

    expect(decision.mainQuest).toMatchObject({
      taskId: "later-deficit",
      evidence: { deadlineState: "FUTURE_CAPACITY_DEFICIT", capacitySlackMinutes: -30, canFitToday: false }
    });
    expect(decision.mainQuest?.reasonCodes).toContain("FUTURE_CAPACITY_DEFICIT");
  });

  it("uses cumulative competing deadline work to detect a shared deficit", () => {
    const decision = decide([
      candidate("A", { deadline: atLocalDate("2026-10-06"), remainingMinutes: 100 }),
      candidate("B", { deadline: atLocalDate("2026-10-06"), remainingMinutes: 180, feasibility: { canFitToday: false } })
    ]);

    expect(decision.mainQuest?.evidence).toMatchObject({
      deadlineState: "FUTURE_CAPACITY_DEFICIT",
      capacitySlackMinutes: -40
    });
    expect(decision.upNext[0]?.evidence).toMatchObject({
      deadlineState: "FUTURE_CAPACITY_DEFICIT",
      capacitySlackMinutes: -40
    });
  });

  it("orders commitment REQUIRED, IMPORTANT, OPTIONAL, then null when deadline evidence ties", () => {
    const decision = decide([
      candidate("none"),
      candidate("optional", { contextEvidence: { commitmentLevel: "OPTIONAL", strategicImportance: null } }),
      candidate("important", { contextEvidence: { commitmentLevel: "IMPORTANT", strategicImportance: null } }),
      candidate("required", { contextEvidence: { commitmentLevel: "REQUIRED", strategicImportance: null } })
    ]);

    expect([decision.mainQuest, ...decision.upNext].map((choice) => choice?.taskId)).toEqual([
      "required",
      "important",
      "optional"
    ]);
  });

  it("uses strategic importance after stronger evidence ties", () => {
    const decision = decide([
      candidate("low", { contextEvidence: { commitmentLevel: null, strategicImportance: 1 } }),
      candidate("high", { contextEvidence: { commitmentLevel: null, strategicImportance: 5 } })
    ]);

    expect(decision.mainQuest?.taskId).toBe("high");
    expect(decision.mainQuest?.reasonCodes).toContain("STRATEGIC_IMPORTANCE");
  });

  it("uses today feasibility only after deadline and Context evidence tie", () => {
    const decision = decide([
      candidate("false", { feasibility: { canFitToday: false } }),
      candidate("unknown", { remainingMinutes: null, feasibility: { canFitToday: null } }),
      candidate("true", { feasibility: { canFitToday: true } })
    ]);

    expect([decision.mainQuest, ...decision.upNext].map((choice) => choice?.taskId)).toEqual([
      "true",
      "unknown",
      "false"
    ]);
  });

  it("uses Task importance only after all stronger evidence ties", () => {
    const decision = decide([
      candidate("low", { importance: 1 }),
      candidate("high", { importance: 5 })
    ]);

    expect(decision.mainQuest?.taskId).toBe("high");
    expect(decision.mainQuest?.reasonCodes).toContain("TASK_IMPORTANCE");
    expect(decision.mainQuest?.whyNow).toBe("중요도가 높은 Task라서 우선합니다.");
  });

  it("preserves stable input order when every policy factor ties", () => {
    const candidates = [candidate("B"), candidate("A"), candidate("C")];
    Object.freeze(candidates);

    const first = decide(candidates);
    const second = decide(candidates);

    expect([first.mainQuest, ...first.upNext].map((choice) => choice?.taskId)).toEqual(["B", "A", "C"]);
    expect(second).toEqual(first);
  });

  it("does not invent capacity evidence beyond the known horizon", () => {
    const decision = decide([
      candidate("beyond", { deadline: atLocalDate("2026-10-20"), remainingMinutes: 10_000 })
    ]);

    expect(decision.mainQuest?.evidence).toMatchObject({
      deadlineState: "NONE",
      deadlineDate: "2026-10-20",
      capacitySlackMinutes: null
    });
    expect(decision.mainQuest?.reasonCodes).not.toContain("FUTURE_CAPACITY_DEFICIT");
  });

  it("does not claim safe capacity when deadline-window effort is unknown", () => {
    const decision = decide([
      candidate("unknown", { deadline: atLocalDate("2026-10-06"), remainingMinutes: null, feasibility: { canFitToday: null } }),
      candidate("target", { deadline: atLocalDate("2026-10-07"), remainingMinutes: 30 })
    ]);
    const target = [decision.mainQuest, ...decision.upNext].find((choice) => choice?.taskId === "target");

    expect(target?.evidence).toMatchObject({
      deadlineState: "DEADLINE_WITHIN_HORIZON",
      capacitySlackMinutes: null
    });
  });

  it("prioritizes Project, User, Course, and Certification Candidates through one engine", () => {
    const candidates = [
      candidate("project", { taskType: "project", contextId: "p", contextType: "project" }),
      candidate("user"),
      candidate("course", { taskType: "learning", contextId: "c", contextType: "course" }),
      candidate("certification", { taskType: "learning", contextId: "x", contextType: "certification" })
    ];

    expect(candidates.map((item) => decide([item]).mainQuest?.taskId)).toEqual([
      "project", "user", "course", "certification"
    ]);
  });
});
