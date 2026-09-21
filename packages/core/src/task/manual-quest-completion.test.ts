import { describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";
import type { TaskId, UserId } from "@amber/shared";
import { completeManualQuest, completeManualRoutine } from "./manual-quest-completion.js";
import { SupabaseTaskRepository } from "./supabase-task-repository.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const taskId = "20000000-0000-4000-8000-000000000002" as TaskId;

const sqlDouble = (reply: (query: string) => unknown[] = () => []) => {
  const queries: string[] = [];
  const sql = ((parts: TemplateStringsArray) => {
    const query = parts.join("?");
    queries.push(query);
    return Promise.resolve(reply(query));
  }) as unknown as Sql;
  Object.assign(sql, {
    json: vi.fn((value: unknown) => value),
    begin: async (callback: (tx: Sql) => Promise<unknown>) => callback(sql)
  });
  return { sql, queries };
};

describe("manual quest completion", () => {
  it("completes only the requested child Step and exposes the next Step immediately", async () => {
    const { sql, queries } = sqlDouble((query) => {
      if (query.includes("select status from public.tasks")) return [{ status: "PLANNED" }];
      if (query.includes("select id,position,status from public.task_steps")) {
        return [{ id: "step", position: 1, status: "planned" }];
      }
      if (query.includes("select id from public.task_steps")) return [{ id: "next-step" }];
      return [];
    });

    const result = await completeManualQuest(sql, userId, taskId, "step");

    expect(result).toEqual({
      kind: "step", duplicate: false,
      officialSubmission: { state: "not_linked", sources: [], statuses: [] }
    });
    expect(queries.some((query) => query.includes("update public.tasks set completion_source"))).toBe(false);
    expect(queries.join(" ")).not.toContain("actual_minutes");
    expect(queries.some((query) => query.includes("task_step_completed"))).toBe(true);
  });

  it("completes the parent Task when the completed child is the final Step", async () => {
    const { sql, queries } = sqlDouble((query) => {
      if (query.includes("select status from public.tasks")) return [{ status: "PLANNED" }];
      if (query.includes("select id,position,status from public.task_steps")) {
        return [{ id: "step", position: 1, status: "in_progress" }];
      }
      if (query.includes("update public.plan_items")) return [{ id: "plan-item", planned_minutes: 30 }];
      return [];
    });
    const task = { id: taskId, status: "PLANNED" };
    const getTask = vi.spyOn(SupabaseTaskRepository.prototype, "getTaskById").mockResolvedValue(task as never);
    const transition = vi.spyOn(SupabaseTaskRepository.prototype, "transitionTask")
      .mockResolvedValue({ kind: "updated", task: { ...task, status: "DONE" } } as never);
    try {
      const result = await completeManualQuest(sql, userId, taskId, "step");
      expect(result).toMatchObject({ kind: "task", duplicate: false });
      expect(transition).toHaveBeenCalledOnce();
      expect(queries.some((query) => query.includes("manual_completion_recorded"))).toBe(true);
      expect(queries.some((query) => query.includes("replan_triggered"))).toBe(true);
    } finally {
      getTask.mockRestore();
      transition.mockRestore();
    }
  });

  it("treats duplicate Task completion as a successful no-op and preserves official mismatch", async () => {
    const { sql, queries } = sqlDouble((query) => {
      if (query.includes("select status from public.tasks")) return [{ status: "DONE" }];
      if (query.includes("from public.external_references")) return [{ source: "snowboard" }];
      if (query.includes("from public.course_assessments")) return [{ submission_status: "pending" }];
      return [];
    });
    const task = { id: taskId, status: "DONE" };
    const getTask = vi.spyOn(SupabaseTaskRepository.prototype, "getTaskById").mockResolvedValue(task as never);
    const transition = vi.spyOn(SupabaseTaskRepository.prototype, "transitionTask");
    try {
      expect(await completeManualQuest(sql, userId, taskId)).toEqual({
        kind: "task", duplicate: true,
        officialSubmission: { state: "pending_confirmation", sources: ["snowboard"], statuses: ["pending"] }
      });
      expect(transition).not.toHaveBeenCalled();
      expect(queries.some((query) => query.includes("update public.plan_items"))).toBe(false);
    } finally {
      getTask.mockRestore();
      transition.mockRestore();
    }
  });

  it("does not manually complete a Task while its Focus session is active", async () => {
    const { sql, queries } = sqlDouble((query) => {
      if (query.includes("select status from public.tasks")) return [{ status: "IN_PROGRESS" }];
      if (query.includes("from public.focus_sessions")) return [{ id: "active" }];
      return [];
    });
    await expect(completeManualQuest(sql, userId, taskId)).rejects.toThrow("진행 중인 Focus");
    expect(queries.some((query) => query.includes("update public.tasks"))).toBe(false);
  });

  it("marks an existing routine occurrence complete without timing it", async () => {
    const { sql, queries } = sqlDouble((query) => {
      if (query.includes("select o.id,o.status")) return [{ id: "occurrence", status: "planned" }];
      if (query.includes("update public.plan_items")) return [{ id: "plan-item", planned_minutes: 30 }];
      return [];
    });
    await expect(completeManualRoutine(sql, userId, "occurrence")).resolves.toEqual({ duplicate: false });
    expect(queries.some((query) => query.includes("activity_occurrence_completed"))).toBe(true);
    expect(queries.some((query) => query.includes("replan_triggered"))).toBe(true);
    expect(queries.join(" ")).not.toContain("set actual_minutes");
  });

  it("treats duplicate routine completion as a successful no-op", async () => {
    const { sql, queries } = sqlDouble((query) => query.includes("select o.id,o.status")
      ? [{ id: "occurrence", status: "completed" }]
      : []);
    await expect(completeManualRoutine(sql, userId, "occurrence")).resolves.toEqual({ duplicate: true });
    expect(queries.some((query) => query.includes("update public.activity_occurrences"))).toBe(false);
  });

  it("does not manually complete a routine while its Focus session is active", async () => {
    const { sql, queries } = sqlDouble((query) => query.includes("from public.focus_sessions")
      ? [{ id: "active" }]
      : []);
    await expect(completeManualRoutine(sql, userId, "occurrence")).rejects.toThrow("진행 중인 Focus");
    expect(queries.some((query) => query.includes("update public.activity_occurrences"))).toBe(false);
  });
});
