import { describe, expect, it } from "vitest";
import { calculateCourseStudyRecommendations, type CourseStudySignal } from "./course-study-planning.js";

const course = (overrides: Partial<CourseStudySignal> = {}): CourseStudySignal => ({
  workContextId: "context", courseId: "course", title: "알고리즘입문",
  completedLectureCount: 1, remainingLectureCount: 2, remainingLectureMinutes: 60,
  assessments: [], ...overrides
});

describe("course study planning", () => {
  it("prioritizes a near quiz and combines lecture, review, and assessment preparation", () => {
    const [result] = calculateCourseStudyRecommendations({
      courses: [course({ assessments: [{ type: "quiz", title: "온라인 퀴즈", dueAt: new Date("2026-09-21T14:59:00Z"), completed: false }] })],
      now: new Date("2026-09-15T00:00:00Z"), timeZone: "Asia/Seoul", localWeekday: 2
    });
    expect(result).toMatchObject({ weeklyMinutes: 165, todayMinutes: 30, priorityRank: 0 });
    expect(result?.reasons).toContain("6일 내 퀴즈");
  });

  it("limits distant evaluation preparation while preserving a minimum weekly pace", () => {
    const results = calculateCourseStudyRecommendations({
      courses: [
        course({ courseId: "exam", remainingLectureCount: 0, remainingLectureMinutes: 0, assessments: [{ type: "exam", title: "기말", dueAt: new Date("2026-12-03T04:30:00Z"), completed: false }] }),
        course({ courseId: "quiet", remainingLectureCount: 0, remainingLectureMinutes: 0 })
      ],
      now: new Date("2026-09-15T00:00:00Z"), timeZone: "Asia/Seoul", localWeekday: 2
    });
    expect(results.find((value) => value.courseId === "exam")?.weeklyMinutes).toBe(45);
    expect(results.find((value) => value.courseId === "quiet")).toMatchObject({ weeklyMinutes: 45, priorityRank: 4 });
  });

  it("caps one course at 90 minutes today", () => {
    const [result] = calculateCourseStudyRecommendations({
      courses: [course({ remainingLectureCount: 20, remainingLectureMinutes: 600 })],
      now: new Date("2026-09-20T00:00:00Z"), timeZone: "Asia/Seoul", localWeekday: 7
    });
    expect(result).toMatchObject({ weeklyMinutes: 360, todayMinutes: 90 });
  });
});
