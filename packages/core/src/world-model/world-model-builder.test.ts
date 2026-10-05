import { describe, expect, it, vi } from "vitest";
import type { UserId } from "@amber/shared";
import type {
  CertificationContextRecord,
  CourseContextRecord,
  ProjectContextRecord
} from "../context-management/context-management.js";
import type { MorningObservation } from "../morning/morning.js";
import { calculateDailyCapacity } from "../rules/daily-capacity-policy.js";
import type { Task } from "../task/task.js";
import {
  WorldModelBuilder,
  type WorldModelSource,
  type WorldModelSourceState
} from "./world-model-builder.js";

const now = new Date("2026-09-30T03:00:00.000Z");
const userId = "00000000-0000-4000-8000-000000000001" as UserId;
const projectId = "00000000-0000-4000-8000-000000000010";
const courseId = "00000000-0000-4000-8000-000000000011";
const certificationId = "00000000-0000-4000-8000-000000000012";

const task = (overrides: Partial<Task> & Pick<Task, "id" | "title">): Task => {
  const { id, title, ...rest } = overrides;
  return ({
  id,
  userId,
  workContextId: null,
  objectiveId: null,
  title,
  description: null,
  executionMode: "standard",
  officialDeadline: null,
  internalDeadline: null,
  plannedDate: null,
  estimatedMinutes: null,
  estimatedUserMinutes: null,
  actualMinutes: 0,
  importance: 3,
  status: "INBOX",
  nextAction: null,
  completionCriteria: null,
  completionSource: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  completedAt: null,
  updatedAt: now,
  ...rest
} as Task);
};

const project: ProjectContextRecord = {
  id: projectId, userId, kind: "project", title: "Lifehacker", description: null,
  strategicImportance: 5, commitmentLevel: "REQUIRED", startDate: null, endDate: null,
  internalStartDate: null, strategyConfig: {}
};
const course: CourseContextRecord = {
  id: courseId, userId, kind: "course", title: "Database", description: null,
  strategicImportance: null, commitmentLevel: "IMPORTANT", startDate: null, endDate: "2026-12-20",
  internalStartDate: null, strategyConfig: {}, targetGrade: "A", term: "2026-2", instructor: null
};
const certification: CertificationContextRecord = {
  id: certificationId, userId, kind: "certification", title: "JLPT N2", description: null,
  strategicImportance: null, commitmentLevel: "IMPORTANT", startDate: null, endDate: null,
  internalStartDate: null, strategyConfig: {}, targetOutcome: "Pass", examDate: "2026-12-06",
  studyMode: "CUMULATIVE", currentLevel: null
};

const calendarBlock = {
  id: "calendar-1",
  title: "Class",
  blocksCapacity: true,
  constraintType: "availability",
  hardness: "hard",
  origin: "google_calendar",
  start: new Date("2026-09-30T04:00:00.000Z"),
  end: new Date("2026-09-30T05:00:00.000Z")
};

const observation: MorningObservation = {
  timeZone: "Asia/Seoul",
  planningBufferMinutes: 30,
  planningPolicy: {},
  constraints: [calendarBlock],
  tasks: [
    task({
      id: "00000000-0000-4000-8000-000000000101" as Task["id"],
      title: "Ship World Model",
      workContextId: projectId,
      status: "IN_PROGRESS",
      internalDeadline: new Date("2026-09-30T02:00:00.000Z"),
      plannedDate: "2026-09-30",
      estimatedMinutes: 800,
      actualMinutes: 20,
      completionCriteria: "Snapshot is queryable"
    }),
    task({
      id: "00000000-0000-4000-8000-000000000102" as Task["id"],
      title: "Review lecture",
      workContextId: courseId,
      estimatedUserMinutes: 60
    }),
    task({
      id: "00000000-0000-4000-8000-000000000103" as Task["id"],
      title: "Practice vocabulary",
      workContextId: certificationId,
      estimatedMinutes: 45
    }),
    task({
      id: "00000000-0000-4000-8000-000000000104" as Task["id"],
      title: "Already done",
      status: "DONE",
      completedAt: now
    })
  ],
  recurringActivities: [],
  strategicDirectives: []
};

const state: WorldModelSourceState = {
  observation,
  calendarEvents: [calendarBlock],
  projects: [project],
  courses: [course],
  certifications: [certification],
  execution: [
    { outcome: "completed", taskId: "done", title: "Completed", occurredAt: now, actualMinutes: 20 },
    { outcome: "partial", taskId: "partial", title: "Partial", occurredAt: now, actualMinutes: 15 },
    { outcome: "skipped", taskId: "skipped", title: "Skipped", occurredAt: now, actualMinutes: 0 }
  ],
  weekFocus: [{ id: "weekly", title: "Architecture foundation", type: "weekly_goal" }],
  futureConstraints: [{
    ...calendarBlock,
    id: "future-calendar",
    start: new Date("2026-10-01T04:00:00.000Z"),
    end: new Date("2026-10-01T05:00:00.000Z")
  }]
};

describe("WorldModelBuilder", () => {
  it("builds current task-first reality without priority or an LLM dependency", async () => {
    const read = vi.fn(async () => state);
    const source: WorldModelSource = { read };
    const snapshot = await new WorldModelBuilder(source).build(userId, "Asia/Seoul", now);

    expect(read).toHaveBeenCalledOnce();
    expect(snapshot.now).toBe(now);
    expect(snapshot.tasks).toHaveLength(3);
    expect(snapshot.tasks[0]).toMatchObject({
      title: "Ship World Model",
      contextId: projectId,
      contextType: "project",
      contextTitle: "Lifehacker",
      taskType: "project",
      status: "IN_PROGRESS",
      importance: 3,
      deadlineSource: "internal",
      estimatedMinutes: 800,
      actualMinutes: 20,
      remainingMinutes: 780,
      completionCriteria: "Snapshot is queryable"
    });
    expect(snapshot.tasks.some((item) => item.title === "Already done")).toBe(false);
    expect(snapshot.tasks.every((item) => !("priority" in item))).toBe(true);
    expect(snapshot).not.toHaveProperty("candidates");
  });

  it("exposes shallow Project, Course, and Certification context reality", async () => {
    const snapshot = await new WorldModelBuilder({ read: async () => state }).build(userId, "Asia/Seoul", now);

    expect(snapshot.contexts.projects[0]).toMatchObject({
      id: projectId,
      commitmentLevel: "REQUIRED",
      strategicImportance: 5,
      activeTaskIds: ["00000000-0000-4000-8000-000000000101"],
      remainingWorkloadMinutes: 780
    });
    expect(snapshot.contexts.learning).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: courseId, type: "course", title: "Database", commitmentLevel: "IMPORTANT", strategicImportance: null, target: "A" }),
      expect.objectContaining({ id: certificationId, type: "certification", title: "JLPT N2", commitmentLevel: "IMPORTANT", strategicImportance: null, target: "Pass", targetDate: "2026-12-06" })
    ]));
  });

  it("uses Calendar blockers and the canonical daily capacity policy", async () => {
    const snapshot = await new WorldModelBuilder({ read: async () => state }).build(userId, "Asia/Seoul", now);
    const canonical = calculateDailyCapacity({
      planDate: "2026-09-30",
      timeZone: "Asia/Seoul",
      now,
      blockingIntervals: [calendarBlock],
      planningBufferMinutes: 30
    });

    expect(snapshot.constraints.calendarEvents[0]).toMatchObject({ title: "Class", origin: "google_calendar" });
    expect(snapshot.constraints.todayCapacity).toEqual({
      availableMinutes: canonical.availableMinutes,
      blockedMinutes: canonical.blockedMinutes,
      elapsedMinutes: canonical.elapsedMinutes,
      planningBufferMinutes: canonical.planningBufferMinutes
    });
    expect(snapshot.constraints.futureCapacity).toHaveLength(7);
    expect(snapshot.constraints.futureCapacity[0]).toMatchObject({ date: "2026-10-01", blockedMinutes: 60 });
  });

  it("reflects today's terminal execution outcomes without returning them as active Tasks", async () => {
    const snapshot = await new WorldModelBuilder({ read: async () => state }).build(userId, "Asia/Seoul", now);

    expect(snapshot.execution.completedToday.map((item) => item.taskId)).toEqual(["done"]);
    expect(snapshot.execution.partialToday.map((item) => item.taskId)).toEqual(["partial"]);
    expect(snapshot.execution.skippedToday.map((item) => item.taskId)).toEqual(["skipped"]);
    expect(snapshot.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "deadline_overdue" }),
      expect.objectContaining({ type: "today_workload_exceeds_capacity" })
    ]));
    expect(snapshot.focus).toEqual({
      week: [{ id: "weekly", title: "Architecture foundation", type: "weekly_goal" }],
      todayMustWin: null
    });
  });
});
