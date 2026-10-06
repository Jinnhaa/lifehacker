import type { TaskId, UserId } from "@amber/shared";
import type { Sql, TransactionSql } from "postgres";
import { describe, expect, it } from "vitest";
import type { LearningTaskProposal } from "./learning-task-execution.js";
import { SupabaseLearningTaskExecutionRepository } from "./supabase-learning-task-execution-repository.js";

interface RecordedQuery {
  readonly query: string;
  readonly values: readonly unknown[];
}

const userId = "00000000-0000-4000-8000-000000000001" as UserId;
const taskId = "00000000-0000-4000-8000-000000000002" as TaskId;

const exactProposal = (learningUnitId = "unit-exact"): LearningTaskProposal => ({
  materializationKey: `course-recipe:cell:${learningUnitId}`,
  workContextId: "context",
  stageId: "stage",
  materialId: "material",
  allocationPolicyId: null,
  allocationPolicyName: null,
  planDate: "2026-10-06",
  importance: 4,
  title: "자료구조 해시 테이블",
  completionCriteria: "선택한 학습 단위 완료",
  assignedUnits: 1,
  estimatedMinutes: 45,
  startSequence: 7,
  endSequence: 7,
  learningUnitIds: [learningUnitId],
  recoveryMode: "MANUAL",
  source: "PERSISTED_POLICY",
  reasons: []
});

const mockSql = (handler: (query: string, values: readonly unknown[]) => unknown) => {
  const queries: RecordedQuery[] = [];
  const transaction = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?").replaceAll(/\s+/gu, " ").trim();
    queries.push({ query, values });
    return handler(query, values);
  }, { json: (value: unknown) => value }) as unknown as TransactionSql;
  const sql = Object.assign(transaction, {
    begin: async <T>(callback: (tx: TransactionSql) => Promise<T>): Promise<T> => callback(transaction)
  }) as unknown as Sql;
  return { sql, queries };
};

describe("canonical Learning Task execution persistence", () => {
  it("materializes the exact CourseRecipe Learning Unit identity", async () => {
    const { sql, queries } = mockSql((query) => {
      if (query.includes("materialization_key=? limit 1")) return [];
      if (query.includes("select id from public.learning_materials")) return [{ id: "material" }];
      if (query.includes("select id from public.learning_units")) return [{ id: "unit-exact" }];
      if (query.includes("x.learning_unit_id=?")) return [];
      if (query.includes("insert into public.tasks")) return [{ id: taskId }];
      if (query.includes("insert into public.task_learning_targets")) return [{ id: "target-created" }];
      return { count: 1 };
    });

    const result = await new SupabaseLearningTaskExecutionRepository(sql).materialize(
      userId, exactProposal(), new Date("2026-10-06T00:00:00Z")
    );

    expect(result).toEqual({ kind: "created", taskId, targetId: "target-created" });
    const targetInsert = queries.find(({ query }) => query.includes("insert into public.task_learning_targets"));
    expect(targetInsert?.query).toContain("learning_unit_id");
    expect(targetInsert?.values).toContain("unit-exact");
    expect(queries.some(({ query }) => query.includes("select count(*)::integer count"))).toBe(false);
  });

  it("fails closed when an explicit Learning Unit is invalid or stale", async () => {
    const { sql, queries } = mockSql((query) => {
      if (query.includes("materialization_key=? limit 1")) return [];
      if (query.includes("select id from public.learning_materials")) return [{ id: "material" }];
      if (query.includes("select id from public.learning_units")) return [];
      return { count: 1 };
    });

    await expect(new SupabaseLearningTaskExecutionRepository(sql).materialize(
      userId, exactProposal("unit-stale"), new Date("2026-10-06T00:00:00Z")
    )).rejects.toThrow("Explicit Learning Unit is invalid, stale, or already complete");

    expect(queries.some(({ query }) => query.includes("select count(*)::integer count"))).toBe(false);
    expect(queries.some(({ query }) => query.includes("insert into public.tasks"))).toBe(false);
  });

  it("returns the existing active target when the exact Learning Unit overlaps", async () => {
    const { sql, queries } = mockSql((query) => {
      if (query.includes("materialization_key=? limit 1")) return [];
      if (query.includes("select id from public.learning_materials")) return [{ id: "material" }];
      if (query.includes("select id from public.learning_units")) return [{ id: "unit-exact" }];
      if (query.includes("x.learning_unit_id=?")) return [{ task_id: "task-existing", target_id: "target-existing", status: "PLANNED" }];
      return { count: 1 };
    });

    const result = await new SupabaseLearningTaskExecutionRepository(sql).materialize(userId, exactProposal());

    expect(result).toEqual({ kind: "overlap", taskId: "task-existing", targetId: "target-existing" });
    const overlapQuery = queries.find(({ query }) => query.includes("x.learning_unit_id=?"));
    expect(overlapQuery?.query).toContain("x.start_sequence");
    expect(queries.some(({ query }) => query.includes("insert into public.tasks"))).toBe(false);
  });

  it("executes exactly the persisted Learning Unit without mutating a nearby sequence", async () => {
    const { sql, queries } = mockSql((query) => {
      if (query.includes("select x.*,t.status task_status")) return [{
        id: "target", task_id: taskId, material_id: "material", learning_unit_id: "unit-exact",
        target_role: "EXECUTION_TARGET",
        start_sequence: 7, end_sequence: 7, assigned_units: 1, completed_units: 0,
        completed_through_sequence: null, execution_status: "PENDING", resolved_at: null,
        recovery_mode: "MANUAL", materialization_key: "course-recipe:cell:unit-exact", task_status: "PLANNED"
      }];
      if (query.includes("select id,sequence_no,exposure_state") && query.includes("where id=?")) return [{
        id: "unit-exact", sequence_no: 7, exposure_state: "PARTIAL", understanding_state: "STRONG", validation_state: "PASSED"
      }];
      if (query.includes("select id,sequence_no,exposure_state") && query.includes("sequence_no between")) return [{
        id: "unit-nearby", sequence_no: 7, exposure_state: "NOT_STARTED", understanding_state: "UNKNOWN", validation_state: "NOT_TESTED"
      }];
      if (query.includes("select sequence_no from public.learning_units")) return [];
      if (query.includes("select status from public.learning_materials")) return [{ status: "COMPLETED" }];
      return { count: 1 };
    });

    const result = await new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId, taskId, targetId: "target", command: { outcome: "COMPLETED" },
      occurredAt: new Date("2026-10-06T00:00:00Z")
    });

    expect(result.affectedUnits).toEqual([{
      learningUnitId: "unit-exact", sequenceNo: 7, exposureBefore: "PARTIAL", exposureAfter: "COMPLETE",
      understandingUnchanged: "STRONG", validationUnchanged: "PASSED"
    }]);
    const unitRead = queries.find(({ query }) => query.includes("select id,sequence_no,exposure_state"));
    expect(unitRead?.query).toContain("where id=?");
    expect(unitRead?.query).not.toContain("sequence_no between");
    const exposureUpdate = queries.find(({ query }) => query.includes("update public.learning_units set exposure_state='COMPLETE'"));
    expect(exposureUpdate?.query).toContain("where id=?");
    expect(exposureUpdate?.values).toContain("unit-exact");
    expect(exposureUpdate?.query).not.toContain("sequence_no between");
    expect(exposureUpdate?.query).not.toContain("understanding_state=");
    expect(exposureUpdate?.query).not.toContain("validation_state=");
  });

  it("fails exact execution closed when the persisted Learning Unit is stale", async () => {
    const { sql, queries } = mockSql((query) => {
      if (query.includes("select x.*,t.status task_status")) return [{
        id: "target", task_id: taskId, material_id: "material", learning_unit_id: "unit-stale",
        target_role: "EXECUTION_TARGET",
        start_sequence: 7, end_sequence: 7, assigned_units: 1, completed_units: 0,
        completed_through_sequence: null, execution_status: "PENDING", resolved_at: null,
        recovery_mode: "MANUAL", materialization_key: "course-recipe:cell:unit-stale", task_status: "PLANNED"
      }];
      if (query.includes("select id,sequence_no,exposure_state")) return [];
      return { count: 1 };
    });

    await expect(new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId, taskId, targetId: "target", command: { outcome: "COMPLETED" }
    })).rejects.toThrow("Exact Learning Unit evidence not found");

    const unitRead = queries.find(({ query }) => query.includes("select id,sequence_no,exposure_state"));
    expect(unitRead?.query).toContain("where id=?");
    expect(unitRead?.query).not.toContain("sequence_no between");
    expect(queries.some(({ query }) => query.includes("update public.learning_units"))).toBe(false);
    expect(queries.some(({ query }) => query.includes("update public.task_learning_targets"))).toBe(false);
  });

  it("preserves bounded Certification range execution", async () => {
    const { sql, queries } = mockSql((query) => {
      if (query.includes("select x.*,t.status task_status")) return [{
        id: "target", task_id: taskId, material_id: "material", learning_unit_id: null,
        target_role: "EXECUTION_TARGET",
        start_sequence: 2, end_sequence: 3, assigned_units: 2, completed_units: 0,
        completed_through_sequence: null, execution_status: "PENDING", resolved_at: null,
        recovery_mode: "MANUAL", materialization_key: "learning:test", task_status: "PLANNED"
      }];
      if (query.includes("select id,sequence_no,exposure_state")) return [
        { id: "unit-2", sequence_no: 2, exposure_state: "NOT_STARTED", understanding_state: "WEAK", validation_state: "PASSED" },
        { id: "unit-3", sequence_no: 3, exposure_state: "PARTIAL", understanding_state: "OK", validation_state: "FAILED" }
      ];
      if (query.includes("select sequence_no from public.learning_units")) return [];
      if (query.includes("select status from public.learning_materials")) return [{ status: "COMPLETED" }];
      return { count: 1 };
    });

    const result = await new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId, taskId, targetId: "target", command: { outcome: "COMPLETED" },
      occurredAt: new Date("2026-10-06T00:00:00Z")
    });

    expect(result).toMatchObject({ nextIncompleteSequence: null, materialStatus: "COMPLETED",
      affectedUnits: [
        { learningUnitId: "unit-2", sequenceNo: 2, understandingUnchanged: "WEAK", validationUnchanged: "PASSED" },
        { learningUnitId: "unit-3", sequenceNo: 3, understandingUnchanged: "OK", validationUnchanged: "FAILED" }
      ] });
    const exposureUpdate = queries.find(({ query }) => query.includes("update public.learning_units set exposure_state='COMPLETE'"));
    expect(exposureUpdate?.query).toContain("sequence_no between");
    expect(exposureUpdate?.query).not.toContain("understanding_state=");
    expect(exposureUpdate?.query).not.toContain("validation_state=");
  });

  it.each(["RELATED_SCOPE", "RECOMMENDED_READINESS"])("refuses %s before any Learning evidence mutation", async (role) => {
    const { sql, queries } = mockSql((query) => {
      if (query.includes("select x.*,t.status task_status")) return [];
      return { count: 1 };
    });

    await expect(new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId, taskId, targetId: `${role.toLowerCase()}-target`, command: { outcome: "COMPLETED" },
      occurredAt: new Date("2026-10-06T00:00:00Z")
    })).rejects.toThrow("Learning Task target not found");

    const targetQuery = queries.find(({ query }) => query.includes("select x.*,t.status task_status"));
    expect(targetQuery?.query).toContain("x.target_role='EXECUTION_TARGET'");
    expect(queries.some(({ query }) => query.includes("update public.learning_units"))).toBe(false);
    expect(queries.some(({ query }) => query.includes("update public.task_learning_targets"))).toBe(false);
  });
});
