import { randomUUID } from "node:crypto";
import { SupabaseLearningTaskExecutionRepository } from "@amber/core";
import type { TaskId, UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reconcileLearningTasksForToday } from "./learning-task-reconciliation";

vi.mock("server-only", () => ({}));
vi.mock("@amber/core", async () => import("../../../packages/core/src/index"));

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID() as UserId;
const courseId = randomUUID();
const certificationId = randomUUID();
const courseStageId = randomUUID();
const certificationStageId = randomUUID();
const courseMaterialId = randomUUID();
const certificationMaterialId = randomUUID();
const coursePolicyId = randomUUID();
const certificationPolicyId = randomUUID();
const now = new Date("2026-10-01T01:00:00.000Z");

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at)
    values(${userId},${`learning-reconcile-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode,strategic_importance) values
    (${courseId},${userId},'course','Database','active','not_applicable',4),
    (${certificationId},${userId},'certification','JLPT N2','active','not_applicable',4)`;
  await sql`insert into public.course_profiles(work_context_id,user_id,target_grade) values(${courseId},${userId},'A')`;
  await sql`insert into public.certification_profiles(work_context_id,user_id,target_outcome,study_mode)
    values(${certificationId},${userId},'Pass','CUMULATIVE')`;
  await sql`insert into public.learning_stages(id,user_id,work_context_id,title,position,status) values
    (${courseStageId},${userId},${courseId},'Current','1','ACTIVE'),
    (${certificationStageId},${userId},${certificationId},'Current','1','ACTIVE')`;
  await sql`insert into public.learning_materials(id,user_id,work_context_id,stage_id,title,material_type,unit_type,total_units,status) values
    (${courseMaterialId},${userId},${courseId},${courseStageId},'DB 교안','slides','LESSON',19,'ACTIVE'),
    (${certificationMaterialId},${userId},${certificationId},${certificationStageId},'일무따','book','LESSON',2,'ACTIVE')`;
  await sql`insert into public.learning_units(user_id,work_context_id,title,position,stage_id,material_id,sequence_no,unit_type,exposure_state) values
    (${userId},${courseId},'DB 17',1,${courseStageId},${courseMaterialId},17,'LESSON','COMPLETE'),
    (${userId},${courseId},'DB 18',2,${courseStageId},${courseMaterialId},18,'LESSON','NOT_STARTED'),
    (${userId},${courseId},'DB 19',3,${courseStageId},${courseMaterialId},19,'LESSON','NOT_STARTED'),
    (${userId},${certificationId},'일무따 1',1,${certificationStageId},${certificationMaterialId},1,'LESSON','NOT_STARTED'),
    (${userId},${certificationId},'일무따 2',2,${certificationStageId},${certificationMaterialId},2,'LESSON','NOT_STARTED')`;
  await sql`insert into public.learning_allocation_policies(id,user_id,work_context_id,stage_id,name,profile_type,priority,active) values
    (${coursePolicyId},${userId},${courseId},${courseStageId},'Course next','normal',1,true),
    (${certificationPolicyId},${userId},${certificationId},${certificationStageId},'Certification next','normal',1,true)`;
  await sql`insert into public.learning_allocation_items(user_id,allocation_policy_id,material_id,target_units,
    estimated_minutes_min,estimated_minutes_max,position,active) values
    (${userId},${coursePolicyId},${courseMaterialId},1,60,60,1,true),
    (${userId},${certificationPolicyId},${certificationMaterialId},1,45,45,1,true)`;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("reconcileLearningTasksForToday", () => {
  it("materializes one next canonical Task per Course and Certification Material idempotently", async () => {
    const first = await reconcileLearningTasksForToday({ sql, userId, today: "2026-10-01", occurredAt: now });
    expect(first.createdTaskIds).toHaveLength(2);

    const rows = await sql<{
      task_id: string; work_context_id: string; title: string; completion_criteria: string;
      estimated_minutes: number; execution_mode: string; material_id: string;
      start_sequence: number; end_sequence: number; execution_status: string;
    }[]>`
      select t.id task_id,t.work_context_id,t.title,t.completion_criteria,t.estimated_minutes,t.execution_mode,
        x.material_id,x.start_sequence,x.end_sequence,x.execution_status
      from public.tasks t join public.task_learning_targets x on x.task_id=t.id and x.user_id=t.user_id
      where t.user_id=${userId} order by t.title
    `;
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        work_context_id: courseId, title: "DB 교안 18강", completion_criteria: "18강까지 학습 완료",
        estimated_minutes: 60, execution_mode: "learning_required", material_id: courseMaterialId,
        start_sequence: 18, end_sequence: 18, execution_status: "PENDING"
      }),
      expect.objectContaining({
        work_context_id: certificationId, title: "일무따 1강", estimated_minutes: 45,
        execution_mode: "learning_required", material_id: certificationMaterialId,
        start_sequence: 1, end_sequence: 1, execution_status: "PENDING"
      })
    ]));
    expect(rows.some((row) => row.material_id === courseMaterialId && row.start_sequence === 19)).toBe(false);
    expect(rows.some((row) => row.material_id === certificationMaterialId && row.start_sequence === 2)).toBe(false);

    const second = await reconcileLearningTasksForToday({ sql, userId, today: "2026-10-01", occurredAt: now });
    expect(second.createdTaskIds).toEqual([]);
    expect(second.existingTaskIds).toEqual(expect.arrayContaining(first.createdTaskIds));
    const counts = await sql<{ count: number }[]>`select count(*)::int count from public.tasks where user_id=${userId}`;
    expect(counts[0]?.count).toBe(2);
  });

  it("creates the following scope only after manual Learning execution resolves the current Task", async () => {
    const current = await sql<{ task_id: string; target_id: string }[]>`
      select t.id task_id,x.id target_id from public.tasks t join public.task_learning_targets x on x.task_id=t.id and x.user_id=t.user_id
      where t.user_id=${userId} and x.material_id=${courseMaterialId} and x.start_sequence=18
    `;
    await new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId,
      taskId: current[0]!.task_id as TaskId,
      targetId: current[0]!.target_id,
      command: { outcome: "COMPLETED" },
      occurredAt: new Date("2026-10-01T02:00:00.000Z")
    });

    const later = await reconcileLearningTasksForToday({
      sql, userId, today: "2026-10-01", occurredAt: new Date("2026-10-01T02:01:00.000Z")
    });
    expect(later.createdTaskIds).toHaveLength(1);
    const next = await sql<{ title: string; start_sequence: number; end_sequence: number }[]>`
      select t.title,x.start_sequence,x.end_sequence from public.tasks t
      join public.task_learning_targets x on x.task_id=t.id and x.user_id=t.user_id
      where t.id=${later.createdTaskIds[0]} and t.user_id=${userId}
    `;
    expect(next[0]).toEqual({ title: "DB 교안 19강", start_sequence: 19, end_sequence: 19 });
    const certification = await sql<{ task_id: string; target_id: string }[]>`
      select t.id task_id,x.id target_id from public.tasks t join public.task_learning_targets x on x.task_id=t.id and x.user_id=t.user_id
      where t.user_id=${userId} and x.material_id=${certificationMaterialId}
    `;
    await new SupabaseLearningTaskExecutionRepository(sql).applyExecution({
      userId,
      taskId: certification[0]!.task_id as TaskId,
      targetId: certification[0]!.target_id,
      command: { outcome: "SKIPPED", existingPendingUnits: 0, carryForwardLimitUnits: null },
      occurredAt: new Date("2026-10-01T02:02:00.000Z")
    });
    const afterResolvedKey = await reconcileLearningTasksForToday({
      sql, userId, today: "2026-10-01", occurredAt: new Date("2026-10-01T02:03:00.000Z")
    });
    expect(afterResolvedKey.createdTaskIds).toEqual([]);
    const certificationCount = await sql<{ count: number }[]>`
      select count(*)::int count from public.task_learning_targets where user_id=${userId} and material_id=${certificationMaterialId}
    `;
    expect(certificationCount[0]?.count).toBe(1);
  });

  it("defaults legacy target inserts to EXECUTION_TARGET", async () => {
    const legacyTaskId = randomUUID();
    await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,importance,status)
      values(${legacyTaskId},${userId},${certificationId},'Legacy Learning Task','learning_required',3,'PLANNED')`;
    const rows = await sql<{ target_role: string }[]>`
      insert into public.task_learning_targets(user_id,task_id,material_id,assigned_units)
      values(${userId},${legacyTaskId},${certificationMaterialId},1)
      returning target_role`;
    expect(rows[0]?.target_role).toBe("EXECUTION_TARGET");
  });
});
