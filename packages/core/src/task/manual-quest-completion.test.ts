import { describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";
import type { TaskId, UserId } from "@amber/shared";
import { completeManualQuest, completeManualRoutine } from "./manual-quest-completion.js";
import { SupabaseTaskRepository } from "./supabase-task-repository.js";

describe("manual quest completion", () => {
  it("completes only the requested Step and never writes guessed actual time", async () => {
    const queries: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      queries.push(query);
      if (query.includes("update public.task_steps")) return Promise.resolve([{ id: "step", position: 1 }]);
      return Promise.resolve([]);
    }) as unknown as Sql;
    Object.assign(sql, { json: vi.fn((value: unknown) => value) });
    const result = await completeManualQuest(sql,
      "10000000-0000-4000-8000-000000000001" as UserId,
      "20000000-0000-4000-8000-000000000002" as TaskId, "step");
    expect(result).toBe("step");
    expect(queries.some((query) => query.includes("update public.tasks"))).toBe(false);
    expect(queries.join(" ")).not.toContain("actual_minutes");
    expect(queries.some((query) => query.includes("task_step_completed"))).toBe(true);
  });
  it("uses the Task transition and a replan trigger without actual duration", async () => {
    const queries: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      queries.push(query);
      if (query.includes("update public.plan_items")) return Promise.resolve([{ id: "plan-item", planned_minutes: 30 }]);
      return Promise.resolve([]);
    }) as unknown as Sql;
    Object.assign(sql, { json: vi.fn((value: unknown) => value) });
    const taskId = "20000000-0000-4000-8000-000000000002" as TaskId;
    const userId = "10000000-0000-4000-8000-000000000001" as UserId;
    const task = { id: taskId, status: "PLANNED" };
    const getTask = vi.spyOn(SupabaseTaskRepository.prototype, "getTaskById").mockResolvedValue(task as never);
    const transition = vi.spyOn(SupabaseTaskRepository.prototype, "transitionTask").mockResolvedValue({ kind: "updated", task: { ...task, status: "DONE" } } as never);
    try {
      expect(await completeManualQuest(sql, userId, taskId)).toBe("task");
      expect(transition).toHaveBeenCalledOnce();
      expect(queries.some((query) => query.includes("replan_triggered"))).toBe(true);
      expect(queries.join(" ")).not.toContain("actual_minutes");
    } finally {
      getTask.mockRestore();
      transition.mockRestore();
    }
  });
  it("marks an existing routine occurrence complete without timing it", async () => {
    const queries: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      queries.push(query);
      if (query.includes("update public.activity_occurrences")) return Promise.resolve([{ id: "occurrence" }]);
      if (query.includes("update public.plan_items")) return Promise.resolve([{ id: "plan-item", planned_minutes: 30 }]);
      return Promise.resolve([]);
    }) as unknown as Sql;
    Object.assign(sql, { json: vi.fn((value: unknown) => value), begin: async (callback: (tx: Sql) => Promise<unknown>) => callback(sql) });
    await completeManualRoutine(sql, "10000000-0000-4000-8000-000000000001" as UserId, "occurrence");
    expect(queries.some((query) => query.includes("activity_occurrence_completed"))).toBe(true);
    expect(queries.some((query) => query.includes("replan_triggered"))).toBe(true);
    expect(queries.join(" ")).not.toContain("set actual_minutes");
  });
  it("does not manually complete a routine while its Focus session is active", async () => {
    const queries: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      queries.push(query);
      return Promise.resolve(query.includes("from public.focus_sessions") ? [{ id: "active" }] : []);
    }) as unknown as Sql;
    Object.assign(sql, { begin: async (callback: (tx: Sql) => Promise<unknown>) => callback(sql) });
    await expect(completeManualRoutine(sql, "10000000-0000-4000-8000-000000000001" as UserId, "occurrence"))
      .rejects.toThrow("진행 중인 Focus");
    expect(queries.some((query) => query.includes("update public.activity_occurrences"))).toBe(false);
  });
});
