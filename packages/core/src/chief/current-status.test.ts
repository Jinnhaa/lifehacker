import type { TaskId, UserId } from "@amber/shared";
import { describe, expect, it } from "vitest";
import type { MorningObservation } from "../morning/morning.js";
import type { Task } from "../task/task.js";
import { deriveCurrentStatus } from "./current-status.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const now = new Date("2026-09-21T03:00:00.000Z");
const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: id as TaskId, userId, workContextId: null, objectiveId: null, title: id, description: null,
  executionMode: "standard", officialDeadline: null, internalDeadline: null, estimatedMinutes: 30,
  estimatedUserMinutes: null, actualMinutes: 0, importance: 3, status: "PLANNED", nextAction: null,
  completionCriteria: null, completionSource: null, createdAt: now, completedAt: null, updatedAt: now, ...overrides
});

const courseActivity = {
  id: "40000000-0000-4000-8000-000000000004", title: "Database Systems 학습", targetCount: 3,
  expectedMinutes: 45, minimumMinutes: 15, preferredDays: [1, 3, 5], importance: 4,
  completedCount: 0, occurrenceId: "50000000-0000-4000-8000-000000000005",
  courseStudy: {
    workContextId: "30000000-0000-4000-8000-000000000003", weeklyMinutes: 135, todayMinutes: 45,
    priorityRank: 0 as const, reasons: ["2일 내 퀴즈", "미완료 강의 2개"], signals: {
      remainingLectureCount: 2, remainingLectureMinutes: 120,
      nearestQuizAt: "2026-09-23T14:59:00.000Z", nearestQuizTitle: "DB Quiz",
      nearestExamAt: null, nearestExamTitle: null
    }
  }
};

const observation = (tasks: readonly Task[], overrides: Partial<MorningObservation> = {}): MorningObservation => ({
  timeZone: "Asia/Seoul", planningBufferMinutes: 0, planningPolicy: {}, constraints: [], tasks,
  recurringActivities: [courseActivity], strategicDirectives: [], carryoverContext: null,
  outcomeEvidence: { dependencies: [], steps: [], objectives: [], goals: [], artifacts: [], approvedPlan: null,
    activeFocusTaskId: null, approvedAction: null, completedTodayCount: 0, focusEvidence: [] },
  ...overrides
});

describe("Chief Current Status V1", () => {
  it("puts every unfinished official deadline today in P0 before routine study and stale internal targets", () => {
    const status = deriveCurrentStatus({
      observation: observation([
        task("10000000-0000-4000-8000-000000000011", { title: "과제 A", officialDeadline: new Date("2026-09-21T13:00:00.000Z") }),
        task("10000000-0000-4000-8000-000000000012", { title: "과제 B", officialDeadline: new Date("2026-09-21T14:59:00.000Z") }),
        task("10000000-0000-4000-8000-000000000013", { title: "오래된 내부 목표", internalDeadline: new Date("2026-09-10T14:59:00.000Z"), importance: 5 })
      ]), now, planDate: "2026-09-21", remainingCapacityMinutes: 190
    });
    expect(status.officialDueToday.map((item) => item.title)).toEqual(["과제 A", "과제 B"]);
    expect(status.priorities.slice(0, 2).map((item) => [item.title, item.band])).toEqual([["과제 A", "P0"], ["과제 B", "P0"]]);
    expect(status.priorities.find((item) => item.title === "오래된 내부 목표")?.band).toBe("P2");
  });

  it("promotes a D-2 quiz with no study or Focus evidence to P1 NOT_STARTED after due tasks are done", () => {
    const status = deriveCurrentStatus({ observation: observation([]), now, planDate: "2026-09-21", remainingCapacityMinutes: 190 });
    expect(status.assessments[0]).toMatchObject({ title: "DB Quiz", daysUntil: 2, readiness: "NOT_STARTED" });
    expect(status.priorities[0]).toMatchObject({ title: "DB Quiz 준비", band: "P1" });
  });

  it("applies persistent direct-material strategy without treating unfinished video as missing readiness", () => {
    const directive = {
      id: "directive", directive: "데이터베이스는 영상강의를 제외하고 교안으로 직접 공부할 거야.",
      priorityOrder: { kind: "chief_status_override", scope: "PERSISTENT", priorityTaskIds: [],
        workContextId: courseActivity.courseStudy.workContextId, excludeVideo: true, directMaterialStudy: true }
    };
    const readyActivity = { ...courseActivity, completedCount: 1 };
    const status = deriveCurrentStatus({
      observation: observation([], {
        recurringActivities: [readyActivity], strategicDirectives: [directive],
        outcomeEvidence: { dependencies: [], steps: [], objectives: [], goals: [], artifacts: [], approvedPlan: null,
          activeFocusTaskId: null, approvedAction: null, completedTodayCount: 1,
          focusEvidence: [{ workContextId: courseActivity.courseStudy.workContextId, completedSessions: 1, actualMinutes: 45 }] }
      }), now, planDate: "2026-09-21", remainingCapacityMinutes: 145
    });
    expect(status.assessments[0]).toMatchObject({ readiness: "READY", videoExcluded: true });
    expect(status.priorities[0]?.title).toContain("교안 직접 학습");
    expect(status.priorities.some((item) => item.title.includes("영상"))).toBe(false);
  });

  it("keeps routine Focus authoritative and exposes evidence-backed Future Relief", () => {
    const prerequisite = task("10000000-0000-4000-8000-000000000021", { title: "미리 정리할 자료" });
    const status = deriveCurrentStatus({
      observation: observation([prerequisite], {
        recurringActivities: [],
        outcomeEvidence: {
          dependencies: [{ taskId: "dependent", prerequisiteTaskId: String(prerequisite.id), completed: false }],
          steps: [], objectives: [], goals: [], artifacts: [], approvedPlan: null, activeFocusTaskId: null,
          activeFocus: { taskId: null, occurrenceId: "50000000-0000-4000-8000-000000000005", title: "DB 교안 학습" },
          approvedAction: null, completedTodayCount: 0, focusEvidence: []
        }
      }), now, planDate: "2026-09-21", remainingCapacityMinutes: 190
    });
    expect(status.activeFocus).toEqual({ taskId: null, occurrenceId: "50000000-0000-4000-8000-000000000005", title: "DB 교안 학습" });
    expect(status.priorities[0]).toMatchObject({ taskId: String(prerequisite.id), band: "P4" });
  });
});
