import { describe, expect, it, vi } from "vitest";
import { PythonSnowboardClient, type PythonRunner } from "./python-client.js";

const config = {
  baseUrl: "https://snowboard.sookmyung.ac.kr/",
  currentTerm: "2026-2",
  regularCourseIds: ["101"],
  username: "student",
  password: "secret",
  pythonBin: "python3"
};

describe("PythonSnowboardClient", () => {
  it("passes credentials only through the child environment and normalizes collector JSON", async () => {
    const runner = vi.fn(async (_input: Parameters<PythonRunner>[0]) => JSON.stringify([{
      source: "snowboard",
      externalType: "assignment",
      sourceItemId: "9001",
      sourceVersion: "version-1",
      sourceUrl: "https://snowboard.sookmyung.ac.kr/mod/assign/view.php?id=9001",
      observedAt: "2026-09-14T00:00:00Z",
      title: "Database Report",
      officialDeadline: "2026-09-22T14:59:00Z",
      workContextHint: "Database Systems",
      objectiveHint: null,
      status: "open",
      taskSemantics: "clear",
      rawPayload: { courseId: "101", submissionSourceData: { "Submission status": "Not submitted" } }
    }]));
    const items = await new PythonSnowboardClient(runner, "/collector.py").listAssignments(config);
    const invocation = runner.mock.calls[0]?.[0];

    expect(invocation?.args).not.toContain("student");
    expect(invocation?.args).not.toContain("secret");
    expect(invocation?.environment).toEqual({ SNOWBOARD_USERNAME: "student", SNOWBOARD_PASSWORD: "secret" });
    expect(items[0]).toMatchObject({
      source: "snowboard",
      sourceItemId: "9001",
      title: "Database Report",
      officialDeadline: new Date("2026-09-22T14:59:00Z"),
      workContextHint: "Database Systems",
      status: "open"
    });
  });

  it("discovers regular course identities without putting credentials in arguments", async () => {
    const runner = vi.fn(async (_input: Parameters<PythonRunner>[0]) => JSON.stringify([{
      courseId: "101",
      title: "Database Systems (001)",
      url: "https://snowboard.sookmyung.ac.kr/course/view.php?id=101",
      courseType: "R",
      period: "2026-08-31 ~ 2026-12-21"
    }]));
    const courses = await new PythonSnowboardClient(runner, "/collector.py").listCourses(config);
    const invocation = runner.mock.calls[0]?.[0];

    expect(invocation?.args).toContain("--discover-courses");
    expect(invocation?.args).not.toContain("student");
    expect(invocation?.args).not.toContain("secret");
    expect(courses).toEqual([{
      courseId: "101",
      title: "Database Systems (001)",
      url: "https://snowboard.sookmyung.ac.kr/course/view.php?id=101",
      courseType: "R",
      period: "2026-08-31 ~ 2026-12-21"
    }]);
  });

  it("normalizes official academic schedule windows", async () => {
    const runner = vi.fn(async (_input: Parameters<PythonRunner>[0]) => JSON.stringify([{
      source: "snowboard",
      externalType: "academic_schedule",
      externalId: "2043640",
      externalVersion: "version-1",
      sourceUrl: "https://snowboard.sookmyung.ac.kr/course/view.php?id=101#module-2043640",
      observedAt: "2026-09-15T00:00:00Z",
      title: "중간고사",
      start: "2026-10-15T04:30:00Z",
      end: "2026-10-15T05:45:00Z",
      timeZone: "Asia/Seoul",
      courseId: "101",
      courseTitle: "AI Introduction (003)",
      currentTerm: "2026-2"
    }]));
    const schedules = await new PythonSnowboardClient(runner, "/collector.py").listAcademicSchedules(config);

    expect(runner.mock.calls[0]?.[0].args).toContain("--discover-academic-schedules");
    expect(schedules[0]).toMatchObject({
      externalId: "2043640",
      start: new Date("2026-10-15T04:30:00Z"),
      end: new Date("2026-10-15T05:45:00Z")
    });
  });

  it("normalizes aggregate course progress without exposing lecture items as Tasks", async () => {
    const runner = vi.fn(async () => JSON.stringify([{
      courseId: "101", courseTitle: "Algorithms", completedLectureCount: 2,
      remainingLectureCount: 3, remainingLectureMinutes: 90, observedAt: "2026-09-15T00:00:00Z"
    }]));
    const progress = await new PythonSnowboardClient(runner).listCourseProgress(config);
    expect(progress[0]).toMatchObject({ courseId: "101", completedLectureCount: 2, remainingLectureCount: 3, remainingLectureMinutes: 90 });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ args: expect.arrayContaining(["--discover-course-progress"]) }));
  });
});
