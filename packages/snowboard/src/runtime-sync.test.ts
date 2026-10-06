import type { DiscoveredWorkItem } from "@amber/input";
import type { UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { syncSnowboardRuntime } from "./runtime-sync.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const config = {
  baseUrl: "https://snowboard.sookmyung.ac.kr/",
  currentTerm: "2026-2",
  regularCourseIds: ["101"],
  username: "student",
  password: "secret",
  pythonBin: "python3"
};
const course = {
  courseId: "101",
  title: "Database (001)",
  url: "https://snowboard.sookmyung.ac.kr/course/view.php?id=101",
  courseType: "R" as const,
  period: "2026-08-31 ~ 2026-12-21"
};
const assignment: DiscoveredWorkItem = {
  source: "snowboard",
  sourceItemId: "9001",
  sourceVersion: "v1",
  sourceUrl: null,
  observedAt: new Date("2026-09-14T00:00:00Z"),
  title: "Database Report",
  officialDeadline: new Date("2026-09-22T14:59:00Z"),
  workContextHint: "Database (001)",
  objectiveHint: null,
  status: "open",
  taskSemantics: "clear",
  rawPayload: { courseId: "101" }
};
const schedule = {
  source: "snowboard" as const,
  externalType: "academic_schedule" as const,
  externalId: "semester-start",
  externalVersion: "v1",
  sourceUrl: "https://snowboard.sookmyung.ac.kr/",
  observedAt: new Date("2026-09-14T00:00:00Z"),
  title: "Semester start",
  start: new Date("2026-09-01T00:00:00+09:00"),
  end: new Date("2026-09-01T01:00:00+09:00"),
  timeZone: "Asia/Seoul" as const,
  courseId: "101",
  courseTitle: "Database (001)",
  currentTerm: "2026-2"
};

describe("syncSnowboardRuntime", () => {
  it("bootstraps course mappings before processing assignments or schedules and reuses them on repeat", async () => {
    const calls: string[] = [];
    let mapped = false;
    let scheduleApplied = false;
    const client = {
      listCourses: vi.fn(async () => {
        calls.push("listCourses");
        return [course];
      }),
      listAssignments: vi.fn(async () => {
        calls.push("listAssignments");
        expect(mapped).toBe(true);
        return [assignment];
      }),
      listAcademicSchedules: vi.fn(async () => {
        calls.push("listAcademicSchedules");
        expect(mapped).toBe(true);
        return [schedule];
      }),
      listCourseProgress: vi.fn(async () => {
        calls.push("listCourseProgress");
        expect(mapped).toBe(true);
        return [{ courseId: course.courseId, courseTitle: course.title,
          completedLectureCount: 8, remainingLectureCount: 3, remainingLectureMinutes: 95,
          observedAt: new Date("2026-09-15T00:00:00Z") }];
      })
    };
    const courseContextRepository = {
      connectCourse: vi.fn(async () => {
        calls.push("bootstrapCourse");
        const created = !mapped;
        mapped = true;
        return { courseId: course.courseId, workContextId: "context-1", created };
      })
    };
    const processor = {
      processDiscoveredWorkItem: vi.fn(async () => {
        calls.push("processAssignment");
        expect(mapped).toBe(true);
        return { status: "materialized" };
      })
    };
    const academicScheduleRepository = {
      applySchedules: vi.fn(async () => {
        calls.push("applySchedules");
        const created = !scheduleApplied;
        scheduleApplied = true;
        return { received: 1, created: created ? 1 : 0, updated: 0, unchanged: created ? 0 : 1 };
      })
    };
    const courseProgressRepository = {
      applyProgress: vi.fn(async (_userId: UserId, progress: readonly { courseId: string }[]) => {
        calls.push("applyProgress");
        expect(mapped).toBe(true);
        expect(progress[0]?.courseId).toBe(course.courseId);
        return progress.length;
      })
    };

    const first = await syncSnowboardRuntime({
      userId, config, client, processor, courseContextRepository, academicScheduleRepository, courseProgressRepository,
      observedAt: new Date("2026-09-15T00:00:00Z")
    });
    const second = await syncSnowboardRuntime({
      userId, config, client, processor, courseContextRepository, academicScheduleRepository, courseProgressRepository,
      observedAt: new Date("2026-09-15T00:05:00Z")
    });

    expect(calls).toEqual([
      "listCourses", "bootstrapCourse", "listAssignments", "processAssignment", "listAcademicSchedules", "applySchedules", "listCourseProgress", "applyProgress",
      "listCourses", "bootstrapCourse", "listAssignments", "processAssignment", "listAcademicSchedules", "applySchedules", "listCourseProgress", "applyProgress"
    ]);
    expect(first.courses).toMatchObject({ discovered: 1, created: 1, reused: 0 });
    expect(second.courses).toMatchObject({ discovered: 1, created: 0, reused: 1 });
    expect(first.assignments).toMatchObject({ assignments: 1, materialized: 1 });
    expect(second.schedules).toEqual({ received: 1, created: 0, updated: 0, unchanged: 1 });
    expect(first.courseProgress).toBe(1);
    expect(courseProgressRepository.applyProgress).toHaveBeenCalledTimes(2);
  });
});
