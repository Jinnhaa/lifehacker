import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorldModelSnapshot } from "./world-model-builder.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID() as UserId;
const projectId = randomUUID();
const courseId = randomUUID();
const certificationId = randomUUID();
const activeTaskId = randomUUID();
const completedTaskId = randomUUID();
const constraintId = randomUUID();
const referenceId = randomUUID();
const weeklyGoalId = randomUUID();
const now = new Date("2026-09-30T03:00:00.000Z");

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at)
    values(${userId},${`world-model-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul')`;
  await sql`insert into public.user_settings(user_id,planning_buffer_minutes,week_starts_on)
    values(${userId},30,1)`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values
    (${projectId},${userId},'project','World Model Project','active','auto'),
    (${courseId},${userId},'course','Database','active','not_applicable'),
    (${certificationId},${userId},'certification','JLPT N2','active','not_applicable')`;
  await sql`insert into public.course_profiles(work_context_id,user_id,target_grade,term)
    values(${courseId},${userId},'A','2026-2')`;
  await sql`insert into public.certification_profiles(work_context_id,user_id,target_outcome,exam_date,study_mode)
    values(${certificationId},${userId},'Pass','2026-12-06','CUMULATIVE')`;
  await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,internal_deadline,
    planned_date,estimated_minutes,actual_minutes,importance,status,completion_criteria,completed_at) values
    (${activeTaskId},${userId},${projectId},'Build snapshot','standard','2026-10-01T03:00:00Z',
      '2026-09-30',120,30,5,'IN_PROGRESS','Builder returns facts',null),
    (${completedTaskId},${userId},${courseId},'Finished study','standard',null,
      '2026-09-30',60,55,3,'DONE','Study complete',${now})`;
  await sql`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,
    occurred_at,correlation_id,payload_version,payload) values
    (${userId},'task_completed','task',${completedTaskId},'user',${now},${randomUUID()},1,
      ${sql.json({ previous_status: "IN_PROGRESS", next_status: "DONE", source: "user", changed_at: now.toISOString() })})`;
  await sql`insert into public.constraints(id,user_id,constraint_type,value,hardness,valid_from,valid_until,reason,origin)
    values(${constraintId},${userId},'availability',${sql.json({ title: "Class", blocksCapacity: true })},
      'hard','2026-09-30T04:00:00Z','2026-09-30T05:00:00Z','calendar','google_calendar')`;
  await sql`insert into public.external_references(id,user_id,source,external_type,external_id,ownership,
    internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at)
    values(${referenceId},${userId},'google_calendar','calendar_event','world-model-event','external',
      'constraint',${constraintId},'active',${now},${now})`;
  await sql`insert into public.goals(id,user_id,title,importance,status,origin,level,period_start,period_end)
    values(${weeklyGoalId},${userId},'Architecture foundation',4,'active','user','WEEKLY','2026-09-28','2026-10-04')`;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("SupabaseWorldModelSource", () => {
  it("builds an on-demand snapshot from current database records", async () => {
    const snapshot = await buildWorldModelSnapshot(sql, userId, "Asia/Seoul", now);

    expect(snapshot.tasks).toEqual([
      expect.objectContaining({ id: activeTaskId, contextType: "project", importance: 5, remainingMinutes: 90 })
    ]);
    expect(snapshot.contexts.projects[0]).toMatchObject({ id: projectId, activeTaskIds: [activeTaskId] });
    expect(snapshot.contexts.learning).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: courseId, type: "course" }),
      expect.objectContaining({ id: certificationId, type: "certification" })
    ]));
    expect(snapshot.execution.completedToday[0]).toMatchObject({ taskId: completedTaskId, actualMinutes: 55 });
    expect(snapshot.constraints.calendarEvents[0]).toMatchObject({ id: constraintId, title: "Class" });
    expect(snapshot.focus.week[0]).toMatchObject({ id: weeklyGoalId, type: "weekly_goal" });
  });
});
