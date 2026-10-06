import type { TaskId, UserId } from "@amber/shared";
import type { Sql, TransactionSql } from "postgres";
import { describe, expect, it } from "vitest";
import { SupabaseLearningTaskExecutionRepository } from "./supabase-learning-task-execution-repository.js";

describe("canonical Learning Task execution persistence", () => {
  it("advances Exposure through the existing Task path without changing Understanding or Validation", async () => {
    const queries: string[] = [];
    const transaction = Object.assign(async (strings: TemplateStringsArray) => {
      const query = strings.join("?").replaceAll(/\s+/gu, " ").trim();
      queries.push(query);
      if (query.includes("select x.*,t.status task_status")) return [{
        id: "target", task_id: "00000000-0000-4000-8000-000000000002", material_id: "material",
        target_role: "EXECUTION_TARGET",
        start_sequence: 2, end_sequence: 2, assigned_units: 1, completed_units: 0,
        completed_through_sequence: null, execution_status: "PENDING", resolved_at: null,
        recovery_mode: "MANUAL", materialization_key: "learning:test", task_status: "PLANNED"
      }];
      if (query.includes("select id,sequence_no,exposure_state")) return [{
        id: "unit-2", sequence_no: 2, exposure_state: "NOT_STARTED", understanding_state: "WEAK", validation_state: "PASSED"
      }];
      if (query.includes("select sequence_no from public.learning_units")) return [];
      if (query.includes("select status from public.learning_materials")) return [{ status: "COMPLETED" }];
      return { count: 1 };
    }, { json: (value: unknown) => value }) as unknown as TransactionSql;
    const sql = Object.assign(transaction, {
      begin: async <T>(callback: (tx: TransactionSql) => Promise<T>): Promise<T> => callback(transaction)
    }) as unknown as Sql;

    const result = await new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId: "00000000-0000-4000-8000-000000000001" as UserId,
      taskId: "00000000-0000-4000-8000-000000000002" as TaskId,
      targetId: "target", command: { outcome: "COMPLETED" }, occurredAt: new Date("2026-10-06T00:00:00Z")
    });

    expect(result).toMatchObject({ nextIncompleteSequence: null, materialStatus: "COMPLETED",
      affectedUnits: [{ sequenceNo: 2, exposureAfter: "COMPLETE", understandingUnchanged: "WEAK", validationUnchanged: "PASSED" }] });
    const exposureUpdate = queries.find((query) => query.includes("update public.learning_units set exposure_state='COMPLETE'"));
    expect(exposureUpdate).toBeDefined();
    expect(exposureUpdate).not.toContain("understanding_state=");
    expect(exposureUpdate).not.toContain("validation_state=");
    expect(queries.find((query) => query.includes("select x.*,t.status task_status")))
      .toContain("x.target_role='EXECUTION_TARGET'");
  });

  it.each(["RELATED_SCOPE", "RECOMMENDED_READINESS"])("refuses %s before any Learning evidence mutation", async (role) => {
    const queries: string[] = [];
    const transaction = Object.assign(async (strings: TemplateStringsArray) => {
      const query = strings.join("?").replaceAll(/\s+/gu, " ").trim();
      queries.push(query);
      if (query.includes("select x.*,t.status task_status")) return [];
      return { count: 1 };
    }, { json: (value: unknown) => value }) as unknown as TransactionSql;
    const sql = Object.assign(transaction, {
      begin: async <T>(callback: (tx: TransactionSql) => Promise<T>): Promise<T> => callback(transaction)
    }) as unknown as Sql;

    await expect(new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId: "00000000-0000-4000-8000-000000000001" as UserId,
      taskId: "00000000-0000-4000-8000-000000000002" as TaskId,
      targetId: `${role.toLowerCase()}-target`,
      command: { outcome: "COMPLETED" },
      occurredAt: new Date("2026-10-06T00:00:00Z")
    })).rejects.toThrow("Learning Task target not found");

    const targetQuery = queries.find((query) => query.includes("select x.*,t.status task_status"));
    expect(targetQuery).toContain("x.target_role='EXECUTION_TARGET'");
    expect(queries.some((query) => query.includes("update public.learning_units"))).toBe(false);
    expect(queries.some((query) => query.includes("update public.task_learning_targets"))).toBe(false);
  });
});
