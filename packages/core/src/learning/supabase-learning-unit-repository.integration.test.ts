import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LearningUnitService, summarizeLearningUnits } from "./learning-unit.js";
import { SupabaseLearningUnitRepository } from "./supabase-learning-unit-repository.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID() as UserId;
const other = randomUUID() as UserId;
const courseId = randomUUID();
const certificationId = randomUUID();
const projectId = randomUUID();
const otherCourseId = randomUUID();
const service = new LearningUnitService(new SupabaseLearningUnitRepository(sql));

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values
    (${userId},${`learning-${userId}@example.test`},now(),now()),(${other},${`learning-${other}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${other},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values
    (${courseId},${userId},'course','Course','active','not_applicable'),
    (${certificationId},${userId},'certification','Certification','active','not_applicable'),
    (${projectId},${userId},'project','Project','active','auto'),
    (${otherCourseId},${other},'course','Foreign','active','not_applicable')`;
});
afterAll(async () => { await sql`delete from auth.users where id in (${userId},${other})`; await sql.end(); });

describe("Learning Unit persistence", () => {
  it("creates Course units with next available position", async () => {
    const first = await service.create(userId, courseId, { title: "First" });
    const second = await service.create(userId, courseId, { title: "Second" });
    expect([first.position, second.position]).toEqual([1, 2]);
    expect(first).toMatchObject({ userId, workContextId: courseId, exposureState: "NOT_STARTED", understandingState: "UNKNOWN", validationState: "NOT_TESTED" });
  });
  it("uses the same unit model for Certification", async () => {
    const unit = await service.create(userId, certificationId, { title: "Lesson" });
    expect(unit.workContextId).toBe(certificationId);
    expect((await service.list(userId)).find((candidate) => candidate.id === unit.id)).toEqual(unit);
  });
  it("rejects Project ownership", async () => {
    await expect(service.create(userId, projectId, { title: "Invalid" })).rejects.toThrow("Course 또는 Certification");
    expect((await sql`select id from public.learning_units where work_context_id=${projectId}`).length).toBe(0);
  });
  it("blocks cross-user create, update, delete and list access", async () => {
    const unit = await service.create(userId, courseId, { title: "Private" });
    await expect(service.create(other, courseId, { title: "Foreign" })).rejects.toThrow();
    await expect(service.update(other, courseId, unit.id, { title: "Foreign" })).rejects.toThrow();
    await expect(service.delete(other, courseId, unit.id, true)).rejects.toThrow();
    await expect(service.update(other, otherCourseId, unit.id, { title: "Foreign" })).rejects.toThrow();
    await expect(service.delete(other, otherCourseId, unit.id, true)).rejects.toThrow();
    expect(await service.list(other)).toEqual([]);
  });
  it.each([
    { exposureState: "COMPLETE" as const }, { understandingState: "STRONG" as const }, { validationState: "PASSED" as const }
  ])("updates only the declared state dimension %j", async (input) => {
    const before = await service.create(userId, courseId, { title: "Independent" });
    const after = await service.update(userId, courseId, before.id, input);
    expect(after).toEqual({ ...before, ...input });
    expect((await service.list(userId)).find((unit) => unit.id === before.id)).toEqual(after);
  });
  it("allows independent user declarations without silently resetting advanced states", async () => {
    const before = await service.create(userId, courseId, { title: "Grounded", exposureState: "COMPLETE", understandingState: "STRONG", validationState: "PASSED" });
    const after = await service.update(userId, courseId, before.id, { exposureState: "NOT_STARTED" });
    expect(after).toMatchObject({ exposureState: "NOT_STARTED", understandingState: "STRONG", validationState: "PASSED" });
  });
  it("preserves identity on title and numeric order edits", async () => {
    const before = await service.create(userId, certificationId, { title: "Edit" });
    const after = await service.update(userId, certificationId, before.id, { title: "Edited", position: 100 });
    expect(after).toEqual({ ...before, title: "Edited", position: 100 });
  });
  it("rejects duplicate positions atomically without changing either unit or history", async () => {
    const first = await service.create(userId, certificationId, { title: "Occupied", position: 200 });
    const second = await service.create(userId, certificationId, { title: "Unchanged", position: 201 });
    await expect(service.create(userId, certificationId, { title: "Collision", position: 200 })).rejects.toThrow("이미 사용 중인 순서");
    await expect(service.update(userId, certificationId, second.id, { title: "Wrong", position: 200, validationState: "PASSED" })).rejects.toThrow("이미 사용 중인 순서");
    const units = await service.list(userId);
    expect(units.find((unit) => unit.id === first.id)).toEqual(first);
    expect(units.find((unit) => unit.id === second.id)).toEqual(second);
    expect((await sql`select id from public.domain_events where aggregate_id=${second.id}`).length).toBe(1);
  });
  it("serializes concurrent default positions safely", async () => {
    const units = await Promise.all([service.create(userId, certificationId, { title: "Concurrent A" }), service.create(userId, certificationId, { title: "Concurrent B" })]);
    expect(Math.abs(units[0]!.position - units[1]!.position)).toBe(1);
  });
  it("completed Focus and actual time do not mutate semantic learning state", async () => {
    const before = await service.create(userId, courseId, { title: "Not inferred" });
    const taskId = randomUUID();
    await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,importance,status,actual_minutes)
      values(${taskId},${userId},${courseId},'Lecture','learning_required',3,'DONE',120)`;
    await sql`insert into public.focus_sessions(user_id,task_id,status,started_at,ended_at,actual_minutes)
      values(${userId},${taskId},'completed','2026-09-26T00:00:00Z','2026-09-26T02:00:00Z',120)`;
    expect((await service.list(userId)).find((unit) => unit.id === before.id)).toEqual(before);
  });
  it("explicit deletion retains canonical snapshots and other units", async () => {
    const unit = await service.create(userId, courseId, { title: "Delete explicitly" });
    const updated = await service.update(userId, courseId, unit.id, { understandingState: "WEAK" });
    const sibling = await service.create(userId, courseId, { title: "Keep" });
    expect(() => service.delete(userId, courseId, unit.id, false)).toThrow();
    await service.delete(userId, courseId, unit.id, true);
    expect((await sql`select id from public.learning_units where id=${unit.id}`).length).toBe(0);
    const events = await sql<{ event_type: string; payload: { before: unknown; after: unknown } }[]>`select event_type,payload from public.domain_events where aggregate_id=${unit.id}`;
    expect(events.length).toBe(3);
    expect(events.find((event) => event.event_type === "learning_unit_deleted")?.payload).toMatchObject({ before: updated, after: null });
    expect((await service.list(userId)).find((candidate) => candidate.id === sibling.id)).toEqual(sibling);
  });
  it("derives persisted Context counts without mixing contexts", async () => {
    const units = (await service.list(userId)).filter((unit) => unit.workContextId === certificationId);
    const summary = summarizeLearningUnits(units);
    expect(summary).toEqual({ total: units.length, exposed: 0, weak: 0, notValidated: units.length });
  });
});
