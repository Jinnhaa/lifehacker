import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContextManagementService } from "./context-management.js";
import { SupabaseContextManagementRepository } from "./supabase-context-management-repository.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID() as UserId;
const otherUserId = randomUUID() as UserId;
const service = new ContextManagementService(new SupabaseContextManagementRepository(sql));

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values
    (${userId},${`context-${userId}@example.test`},now(),now()),
    (${otherUserId},${`context-${otherUserId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${otherUserId},'Asia/Seoul')`;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userId},${otherUserId})`;
  await sql.end();
});

describe("SupabaseContextManagementRepository", () => {
  it("creates a course and its owned profile atomically", async () => {
    const id = await service.createCourse(userId, {
      title: "Database", strategicImportance: 5, commitmentLevel: "REQUIRED", startDate: "2026-09-01"
    }, { targetGrade: "A+", term: "2026-2", instructor: "Kim" });
    const rows = await sql<{ kind: string; agent_mode: string; target_grade: string; profile_user_id: string }[]>`
      select w.kind,w.agent_mode,p.target_grade,p.user_id profile_user_id from public.work_contexts w
      join public.course_profiles p on p.work_context_id=w.id where w.id=${id} and w.user_id=${userId}`;
    expect(rows[0]).toEqual({ kind: "course", agent_mode: "not_applicable", target_grade: "A+", profile_user_id: userId });
  });

  it("creates a certification and its owned profile atomically", async () => {
    const id = await service.createCertification(userId, { title: "SQLD", endDate: "2026-11-15" }, {
      targetOutcome: "pass", examDate: "2026-11-15", studyMode: "CUMULATIVE", currentLevel: "beginner"
    });
    const rows = await sql<{ kind: string; study_mode: string; profile_user_id: string }[]>`
      select w.kind,p.study_mode,p.user_id profile_user_id from public.work_contexts w
      join public.certification_profiles p on p.work_context_id=w.id where w.id=${id} and w.user_id=${userId}`;
    expect(rows[0]).toEqual({ kind: "certification", study_mode: "CUMULATIVE", profile_user_id: userId });
  });

  it("round-trips project strategy configuration", async () => {
    const id = await service.createProject(userId, { title: "Portfolio", description: "Ship it" }, {
      projectType: "SPRINT", reviewCadenceDays: 7, displaceable: true
    });
    const project = (await service.listProjects(userId)).find((item) => item.id === id);
    expect(project).toMatchObject({ title: "Portfolio", description: "Ship it",
      strategyConfig: { projectType: "SPRINT", reviewCadenceDays: 7, displaceable: true } });
    const rows = await sql<{ agent_mode: string }[]>`select agent_mode from public.work_contexts where id=${id}`;
    expect(rows[0]?.agent_mode).toBe("auto");
  });

  it("keeps kind immutable during an edit", async () => {
    const id = await service.createCourse(userId, { title: "Networks" }, {});
    await expect(service.updateCertification(userId, id, { title: "Wrong kind" }, {})).rejects.toThrow("종류");
    const rows = await sql<{ kind: string; title: string }[]>`select kind,title from public.work_contexts where id=${id}`;
    expect(rows[0]).toEqual({ kind: "course", title: "Networks" });
  });

  it("preserves ownership and blocks cross-user subtype edits", async () => {
    const id = await service.createCourse(userId, { title: "Operating Systems" }, { targetGrade: "A" });
    await expect(service.updateCourse(otherUserId, id, { title: "Taken" }, { targetGrade: "F" })).rejects.toThrow("찾지 못했습니다");
    const rows = await sql<{ context_user: string; profile_user: string; target_grade: string }[]>`
      select w.user_id context_user,p.user_id profile_user,p.target_grade from public.work_contexts w
      join public.course_profiles p on p.work_context_id=w.id where w.id=${id}`;
    expect(rows[0]).toEqual({ context_user: userId, profile_user: userId, target_grade: "A" });
  });

  it("archives without deleting and omits the row from active listings", async () => {
    const id = await service.createProject(userId, { title: "Archive me" }, {
      projectType: "PERSONAL", reviewCadenceDays: null, displaceable: false
    });
    await service.archive(userId, id, "project");
    const rows = await sql<{ status: string; archived: boolean }[]>`
      select status,(archived_at is not null) archived from public.work_contexts where id=${id}`;
    expect(rows[0]).toEqual({ status: "archived", archived: true });
    expect((await service.listProjects(userId)).some((item) => item.id === id)).toBe(false);
  });
});
