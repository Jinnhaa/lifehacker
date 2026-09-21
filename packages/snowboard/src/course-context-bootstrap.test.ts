import type { UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { CourseContextBootstrapService } from "./course-context-bootstrap.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const config = {
  baseUrl: "https://snowboard.sookmyung.ac.kr/",
  currentTerm: "2026-2",
  regularCourseIds: ["101", "102"],
  username: "student",
  password: "secret",
  pythonBin: "python3"
};

describe("CourseContextBootstrapService", () => {
  it("connects discovered course identities and reports create/reuse counts", async () => {
    const courses = [
      { courseId: "101", title: "Database (001)", url: "https://snowboard.sookmyung.ac.kr/course/view.php?id=101", courseType: "R" as const, period: "2026-08-31 ~ 2026-12-21" },
      { courseId: "102", title: "Algorithms (001)", url: "https://snowboard.sookmyung.ac.kr/course/view.php?id=102", courseType: "R" as const, period: "2026-08-31 ~ 2026-12-21" }
    ];
    const listCourses = vi.fn(async () => courses);
    const connectCourse = vi.fn()
      .mockResolvedValueOnce({ courseId: "101", workContextId: "context-1", created: true })
      .mockResolvedValueOnce({ courseId: "102", workContextId: "context-2", created: false });
    const observedAt = new Date("2026-09-15T00:00:00Z");

    const result = await new CourseContextBootstrapService({ listCourses }, { connectCourse })
      .bootstrap(userId, config, observedAt);

    expect(result).toMatchObject({ discovered: 2, created: 1, reused: 1 });
    expect(connectCourse).toHaveBeenNthCalledWith(1, { userId, course: courses[0], currentTerm: "2026-2", observedAt });
    expect(connectCourse).toHaveBeenNthCalledWith(2, { userId, course: courses[1], currentTerm: "2026-2", observedAt });
  });
});
