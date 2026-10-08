import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { SupabaseCourseProgressRepository } from "./supabase-course-progress-repository.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;

describe("SupabaseCourseProgressRepository", () => {
  it("persists authoritative lecture-module observations without Learning Unit writes", async () => {
    const statements: string[] = [];
    const snapshots = new Map<string, { contextId: string; completed: number }>();
    const lectures = new Map<string, { position: number; completed: boolean }>();
    const sql = ((parts: TemplateStringsArray, ...values: unknown[]) => {
      const statement = parts.join("?");
      statements.push(statement);
      if (statement.includes("select w.id from public.external_references")) return Promise.resolve([{ id: "linked-context" }]);
      if (statement.includes("insert into public.snowboard_course_progress")) {
        snapshots.set(String(values[1]), { contextId: String(values[2]), completed: Number(values[3]) });
      }
      if (statement.includes("insert into public.snowboard_lecture_progress")) {
        lectures.set(String(values[3]), { position: Number(values[4]), completed: Boolean(values[6]) });
      }
      return Promise.resolve([]);
    }) as unknown as Sql;
    const repository = new SupabaseCourseProgressRepository(sql);
    const observation = { courseId: "89632", courseTitle: "Database", completedLectureCount: 8,
      remainingLectureCount: 3, remainingLectureMinutes: 95,
      lectures: [
        { moduleId: "2043101", position: 1, title: "1강", completed: true, estimatedMinutes: 29 },
        { moduleId: "2043102", position: 2, title: "2강", completed: false, estimatedMinutes: 30 }
      ],
      observedAt: new Date("2026-10-05T00:00:00Z") };
    await repository.applyProgress(userId, [observation]);
    await repository.applyProgress(userId, [{ ...observation, completedLectureCount: 9 }]);
    expect(snapshots.size).toBe(1);
    expect(snapshots.get("89632")).toEqual({ contextId: "linked-context", completed: 9 });
    expect(statements.filter((statement) => statement.includes("on conflict(user_id,course_id) do update"))).toHaveLength(2);
    expect(lectures).toEqual(new Map([
      ["2043101", { position: 1, completed: true }],
      ["2043102", { position: 2, completed: false }]
    ]));
    expect(statements.filter((statement) => statement.includes("on conflict(user_id,course_id,module_id) do update"))).toHaveLength(4);
    expect(statements.join(" ")).not.toContain("learning_units");
  });

  it("rejects progress without an active external Course mapping", async () => {
    const sql = (() => Promise.resolve([])) as unknown as Sql;
    const repository = new SupabaseCourseProgressRepository(sql);
    await expect(repository.applyProgress(userId, [{ courseId: "89632", courseTitle: "Database",
      completedLectureCount: 1, remainingLectureCount: 1, remainingLectureMinutes: 30,
      lectures: [],
      observedAt: new Date("2026-10-05T00:00:00Z") }])).rejects.toThrow("Course WorkContext mapping");
  });
});
