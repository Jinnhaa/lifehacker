import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SnowboardAcademicSchedule } from "./contracts.js";
import { SupabaseAcademicScheduleRepository } from "./supabase-academic-schedule-repository.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 3 });
const userId = randomUUID() as UserId;
const contextId = randomUUID();

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values (${userId},${`snowboard-schedule-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values (${userId},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values (${contextId},${userId},'course','AI Introduction (003)','active','not_applicable')`;
  await sql`
    insert into public.external_references(
      user_id,source,external_type,external_id,external_version,ownership,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at
    ) values (${userId},'snowboard','course','101','2026-2','external','work_context',${contextId},'active',now(),now())
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("SupabaseAcademicScheduleRepository", () => {
  it("creates, updates, and deduplicates a source-owned fixed exam constraint", async () => {
    const repository = new SupabaseAcademicScheduleRepository(sql);
    const schedule: SnowboardAcademicSchedule = {
      source: "snowboard",
      externalType: "academic_schedule",
      externalId: "2043640",
      externalVersion: "v1",
      sourceUrl: "https://snowboard.sookmyung.ac.kr/course/view.php?id=101#module-2043640",
      observedAt: new Date("2026-09-15T00:00:00Z"),
      title: "Midterm",
      start: new Date("2026-10-15T04:30:00Z"),
      end: new Date("2026-10-15T05:45:00Z"),
      timeZone: "Asia/Seoul",
      courseId: "101",
      courseTitle: "AI Introduction (003)",
      currentTerm: "2026-2"
    };

    await expect(repository.applySchedules(userId, [schedule])).resolves.toEqual({ received: 1, created: 1, updated: 0, unchanged: 0 });
    await expect(repository.applySchedules(userId, [schedule])).resolves.toEqual({ received: 1, created: 0, updated: 0, unchanged: 1 });
    const changed = { ...schedule, externalVersion: "v2", end: new Date("2026-10-15T06:00:00Z") };
    await expect(repository.applySchedules(userId, [changed])).resolves.toEqual({ received: 1, created: 0, updated: 1, unchanged: 0 });

    const rows = await sql<{ constraints: number; references: number; events: number; valid_until: Date; ownership: string }[]>`
      select
        count(distinct c.id)::int constraints,
        count(distinct r.id)::int references,
        count(distinct e.id)::int events,
        min(c.valid_until) valid_until,
        min(r.ownership) ownership
      from public.constraints c
      join public.external_references r on r.user_id=c.user_id and r.internal_entity_type='constraint' and r.internal_entity_id=c.id
      left join public.domain_events e on e.user_id=c.user_id and e.aggregate_type='constraint' and e.aggregate_id=c.id
      where c.user_id=${userId} and r.source='snowboard' and r.external_type='academic_schedule'
    `;
    expect(rows[0]).toEqual({ constraints: 1, references: 1, events: 2, valid_until: changed.end, ownership: "external" });
  });
});
