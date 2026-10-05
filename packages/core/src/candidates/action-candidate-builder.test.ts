import { describe, expect, it } from "vitest";
import type { TaskStatus } from "../task/task.js";
import type { WorldModelSnapshot, WorldTask } from "../world-model/world-model.js";
import { buildActionCandidates } from "./action-candidate-builder.js";

const now = new Date("2026-10-02T03:00:00.000Z");

const task = (overrides: Partial<WorldTask> & Pick<WorldTask, "id" | "title">): WorldTask => {
  const { id, title, ...rest } = overrides;
  return ({
    id,
    title,
    taskType: "user",
    contextId: null,
    contextType: null,
    contextTitle: null,
    status: "INBOX",
    importance: 3,
    deadline: null,
    deadlineSource: null,
    estimatedMinutes: null,
    actualMinutes: 0,
    remainingMinutes: null,
    plannedDate: null,
    completionCriteria: null,
    ...rest
  });
};

const snapshot = (tasks: readonly WorldTask[], risks: WorldModelSnapshot["risks"] = []): WorldModelSnapshot => ({
  now,
  timeZone: "Asia/Seoul",
  contexts: { learning: [], projects: [] },
  tasks,
  execution: { completedToday: [], partialToday: [], skippedToday: [] },
  constraints: {
    calendarEvents: [],
    todayCapacity: { availableMinutes: 120, blockedMinutes: 0, elapsedMinutes: 0, planningBufferMinutes: 0 },
    futureCapacity: []
  },
  risks,
  focus: { week: [], todayMustWin: null }
});

describe("buildActionCandidates", () => {
  it("projects Project, User, Course, and Certification Tasks through one contract", () => {
    const base = snapshot([
      task({ id: "user", title: "Standalone", status: "INBOX" }),
      task({ id: "project", title: "Project", taskType: "project", contextId: "p", contextType: "project", contextTitle: "Launch", status: "PLANNED" }),
      task({ id: "course", title: "Course", taskType: "learning", contextId: "c", contextType: "course", contextTitle: "Database", status: "IN_PROGRESS" }),
      task({ id: "certification", title: "Certification", taskType: "learning", contextId: "x", contextType: "certification", contextTitle: "JLPT N2", plannedDate: "2026-12-01" })
    ]);
    const candidates = buildActionCandidates({
      ...base,
      contexts: {
        projects: [{ id: "p", title: "Launch", commitmentLevel: "REQUIRED", strategicImportance: 5, activeTaskIds: ["project"], deadlines: [], remainingWorkloadMinutes: 0, unknownEffortTaskIds: [] }],
        learning: [
          { id: "c", type: "course", title: "Database", commitmentLevel: "IMPORTANT", strategicImportance: 4, target: null, targetDate: null, activeTaskIds: ["course"], remainingWorkloadMinutes: 0, unknownEffortTaskIds: [] },
          { id: "x", type: "certification", title: "JLPT N2", commitmentLevel: "OPTIONAL", strategicImportance: null, target: null, targetDate: null, activeTaskIds: ["certification"], remainingWorkloadMinutes: 0, unknownEffortTaskIds: [] }
        ]
      }
    });

    expect(candidates).toEqual([
      expect.objectContaining({ taskId: "user", taskType: "user", contextType: null, status: "INBOX", contextEvidence: { commitmentLevel: null, strategicImportance: null } }),
      expect.objectContaining({ taskId: "project", taskType: "project", contextType: "project", status: "PLANNED", contextEvidence: { commitmentLevel: "REQUIRED", strategicImportance: 5 } }),
      expect.objectContaining({ taskId: "course", taskType: "learning", contextType: "course", status: "IN_PROGRESS", contextEvidence: { commitmentLevel: "IMPORTANT", strategicImportance: 4 } }),
      expect.objectContaining({ taskId: "certification", taskType: "learning", contextType: "certification", plannedDate: "2026-12-01", contextEvidence: { commitmentLevel: "OPTIONAL", strategicImportance: null } })
    ]);
  });

  it("excludes blocked, waiting, and terminal Tasks defensively", () => {
    const excluded: readonly TaskStatus[] = ["BLOCKED", "WAITING_FOR_USER", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"];
    const candidates = buildActionCandidates(snapshot([
      task({ id: "included", title: "Included", status: "INBOX" }),
      ...excluded.map((status) => task({ id: status, title: status, status }))
    ]));

    expect(candidates.map((candidate) => candidate.taskId)).toEqual(["included"]);
  });

  it("adds feasibility and matching World risk evidence without filtering large or overdue Tasks", () => {
    const candidates = buildActionCandidates(snapshot([
      task({ id: "unknown", title: "Unknown", remainingMinutes: null }),
      task({ id: "fits", title: "Fits", estimatedMinutes: 120, remainingMinutes: 120 }),
      task({ id: "large", title: "Large", estimatedMinutes: 180, remainingMinutes: 180, plannedDate: "2026-11-01" }),
      task({ id: "overdue", title: "Overdue", deadline: new Date("2026-10-02T02:59:59.000Z"), deadlineSource: "official", remainingMinutes: 30 })
    ], [
      { type: "deadline_overdue", taskIds: ["overdue"] },
      { type: "today_workload_exceeds_capacity", taskIds: ["large", "overdue"], workloadMinutes: 210, availableMinutes: 120 }
    ]));

    expect(candidates).toHaveLength(4);
    expect(candidates.find((candidate) => candidate.taskId === "unknown")?.feasibility.canFitToday).toBeNull();
    expect(candidates.find((candidate) => candidate.taskId === "fits")?.feasibility.canFitToday).toBe(true);
    expect(candidates.find((candidate) => candidate.taskId === "large")).toMatchObject({
      plannedDate: "2026-11-01",
      feasibility: { canFitToday: false },
      evidence: { overdue: false, worldRiskTypes: ["today_workload_exceeds_capacity"] }
    });
    expect(candidates.find((candidate) => candidate.taskId === "overdue")).toMatchObject({
      evidence: { overdue: true, worldRiskTypes: ["deadline_overdue", "today_workload_exceeds_capacity"] }
    });
  });

  it("preserves World Model order instead of ranking by importance or deadline", () => {
    const input = snapshot([
      task({ id: "A", title: "Low and later", importance: 1, deadline: new Date("2026-10-10T00:00:00.000Z") }),
      task({ id: "B", title: "High and earlier", importance: 5, deadline: new Date("2026-10-03T00:00:00.000Z") })
    ]);
    Object.freeze(input.tasks);
    Object.freeze(input);

    const candidates = buildActionCandidates(input);

    expect(candidates.map((candidate) => candidate.taskId)).toEqual(["A", "B"]);
    expect(candidates.map((candidate) => candidate.importance)).toEqual([1, 5]);
  });
});
