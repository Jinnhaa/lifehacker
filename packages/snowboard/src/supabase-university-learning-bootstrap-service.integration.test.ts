import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseCourseProgressRepository } from "./supabase-course-progress-repository.js";
import { SupabaseUniversityLearningBootstrapService } from "./supabase-university-learning-bootstrap-service.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID() as UserId;
const contextId = randomUUID();
const courseId = `course-${randomUUID()}`;
const progress = {
  courseId,
  courseTitle: "데이터베이스 (001)",
  completedLectureCount: 1,
  remainingLectureCount: 0,
  remainingLectureMinutes: 0,
  lectures: [{ moduleId: "lecture-1", position: 1, title: "관계형 데이터 모델", completed: true, estimatedMinutes: 30 }],
  observedAt: new Date("2026-10-13T00:00:00Z")
};

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at)
    values(${userId},${`snowboard-learning-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode)
    values(${contextId},${userId},'course','데이터베이스 (001)','active','not_applicable')`;
  await sql`insert into public.course_profiles(work_context_id,user_id,target_grade)
    values(${contextId},${userId},'A')`;
  await sql`insert into public.external_references(
    user_id,source,external_type,external_id,ownership,internal_entity_type,internal_entity_id,
    sync_status,first_seen_at,last_seen_at
  ) values (${userId},'snowboard','course',${courseId},'external','work_context',${contextId},'active',now(),now())`;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("Snowboard playback and user learning isolation", () => {
  it("stores completed playback while leaving actual learning untouched across sync retries", async () => {
    const external = new SupabaseCourseProgressRepository(sql);
    const bootstrap = new SupabaseUniversityLearningBootstrapService(sql);
    await external.applyProgress(userId, [progress]);
    expect((await bootstrap.bootstrap(userId, [progress])).courses[0]?.status).toBe("BOOTSTRAPPED");

    const playback = await sql<{ completed: boolean }[]>`
      select completed from public.snowboard_lecture_progress
      where user_id=${userId} and course_id=${courseId} and module_id='lecture-1'`;
    expect(playback[0]?.completed).toBe(true);
    const units = await sql<{ id: string; exposure_state: string; understanding_state: string; validation_state: string }[]>`
      select id,exposure_state,understanding_state,validation_state from public.learning_units
      where user_id=${userId} and work_context_id=${contextId} order by position`;
    expect(units.length).toBeGreaterThan(0);
    expect(units.every((unit) => unit.exposure_state === "NOT_STARTED"
      && unit.understanding_state === "UNKNOWN" && unit.validation_state === "NOT_TESTED")).toBe(true);

    const unitId = units[0]!.id;
    await sql`update public.learning_units set exposure_state='PARTIAL',understanding_state='WEAK'
      where id=${unitId} and user_id=${userId}`;
    await external.applyProgress(userId, [progress]);
    await bootstrap.bootstrap(userId, [progress]);
    const retained = await sql<{ exposure_state: string; understanding_state: string; validation_state: string }[]>`
      select exposure_state,understanding_state,validation_state from public.learning_units
      where id=${unitId} and user_id=${userId}`;
    expect(retained[0]).toEqual({ exposure_state: "PARTIAL", understanding_state: "WEAK", validation_state: "NOT_TESTED" });
    const automaticLearningEvents = await sql<{ count: number }[]>`
      select count(*)::int count from public.domain_events
      where user_id=${userId} and event_type='learning_unit_updated' and actor_type='system'`;
    expect(automaticLearningEvents[0]?.count).toBe(0);
  });
});
