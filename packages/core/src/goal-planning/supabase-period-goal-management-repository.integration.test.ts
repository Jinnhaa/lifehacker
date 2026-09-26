import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PeriodGoalManagementService, type PeriodGoalInput, type PeriodObjectiveInput } from "./period-goal-management.js";
import { SupabasePeriodGoalManagementRepository } from "./supabase-period-goal-management-repository.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID() as UserId;
const other = randomUUID() as UserId;
const service = new PeriodGoalManagementService(new SupabasePeriodGoalManagementRepository(sql));
const monthly: PeriodGoalInput = { title: "Monthly", level: "MONTHLY", parentGoalId: null, periodStart: "2026-09-01", periodEnd: "2026-09-30" };
const weekly: PeriodGoalInput = { title: "Weekly", level: "WEEKLY", parentGoalId: null, periodStart: "2026-09-21", periodEnd: "2026-09-27" };
const objective = (goalId: string): PeriodObjectiveInput => ({ goalId, title: "Objective", progressMode: "STATUS", status: "active", successCriteria: "Ready", targetDate: null, targetValue: null, currentValue: null, unit: null });

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values(${userId},${`goal-${userId}@example.test`},now(),now()),(${other},${`goal-${other}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${other},'Asia/Seoul')`;
});
afterAll(async () => { await sql`delete from auth.users where id in (${userId},${other})`; await sql.end(); });

describe("period goal persistence", () => {
  it("creates Monthly with its period", async () => {
    const id = await service.saveGoal(userId, null, monthly);
    const rows = await sql`select level,period_start::text,period_end::text,status from public.goals where id=${id}`;
    expect(rows[0]).toEqual({ level: "MONTHLY", period_start: "2026-09-01", period_end: "2026-09-30", status: "active" });
  });
  it("creates Weekly with optional Monthly parent", async () => {
    const parent = await service.saveGoal(userId, null, monthly);
    const id = await service.saveGoal(userId, null, { ...weekly, parentGoalId: parent });
    const rows = await sql`select level,parent_goal_id from public.goals where id=${id}`;
    expect(rows[0]).toEqual({ level: "WEEKLY", parent_goal_id: parent });
    const independent = await service.saveGoal(userId, null, weekly);
    expect(independent).not.toBe(id);
  });
  it("preserves identity and non-form metadata on edit", async () => {
    const id = await service.saveGoal(userId, null, monthly);
    await sql`update public.goals set description='preserved',importance=5 where id=${id}`;
    expect(await service.saveGoal(userId, id, { ...monthly, title: "Edited" })).toBe(id);
    const rows = await sql`select title,description,importance from public.goals where id=${id}`;
    expect(rows[0]).toEqual({ title: "Edited", description: "preserved", importance: 5 });
    await expect(service.saveGoal(userId, id, weekly)).rejects.toThrow("level");
  });
  it("rejects foreign and invalid level parents without writing", async () => {
    const foreign = await service.saveGoal(other, null, monthly);
    const week = await service.saveGoal(userId, null, weekly);
    await expect(service.saveGoal(userId, null, { ...weekly, parentGoalId: foreign })).rejects.toThrow();
    await expect(service.saveGoal(userId, null, { ...weekly, parentGoalId: week })).rejects.toThrow();
  });
  it("archives Goal while preserving linked Objective and event history", async () => {
    const id = await service.saveGoal(userId, null, monthly);
    const objectiveId = await service.saveObjective(userId, null, objective(id));
    await service.archiveGoal(userId, id);
    const rows = await sql`select status,archived_at is not null archived from public.goals where id=${id}`;
    expect(rows[0]).toEqual({ status: "archived", archived: true });
    expect((await sql`select id from public.objectives where id=${objectiveId}`).length).toBe(1);
    expect((await sql`select id from public.domain_events where aggregate_id=${id}`).length).toBe(2);
  });
  it("creates and completes/reopens STATUS Objective", async () => {
    const goalId = await service.saveGoal(userId, null, weekly);
    const id = await service.saveObjective(userId, null, objective(goalId));
    await service.saveObjective(userId, id, { ...objective(goalId), status: "achieved" });
    expect((await sql`select status,completed_at is not null completed from public.objectives where id=${id}`)[0]).toEqual({ status: "achieved", completed: true });
    await service.saveObjective(userId, id, objective(goalId));
    expect((await sql`select status,completed_at from public.objectives where id=${id}`)[0]).toEqual({ status: "active", completed_at: null });
  });
  it("creates NUMERIC and updates current value preserving metadata", async () => {
    const goalId = await service.saveGoal(userId, null, weekly);
    const input = { ...objective(goalId), progressMode: "NUMERIC" as const, currentValue: 0, targetValue: 18, unit: "강" };
    const id = await service.saveObjective(userId, null, input);
    await service.saveObjective(userId, id, { ...input, currentValue: 12 });
    expect((await sql`select progress_mode,current_value::text,target_value::text,unit from public.objectives where id=${id}`)[0])
      .toEqual({ progress_mode: "NUMERIC", current_value: "12", target_value: "18", unit: "강" });
  });
  it("cancels Objective without deleting it", async () => {
    const goalId = await service.saveGoal(userId, null, monthly);
    const id = await service.saveObjective(userId, null, objective(goalId));
    await service.cancelObjective(userId, id);
    expect((await sql`select status from public.objectives where id=${id}`)[0]?.status).toBe("cancelled");
  });
  it("blocks foreign Goal/Objective edits, archive and invalid links", async () => {
    const goalId = await service.saveGoal(userId, null, monthly);
    const id = await service.saveObjective(userId, null, objective(goalId));
    await expect(service.saveGoal(other, goalId, monthly)).rejects.toThrow();
    await expect(service.archiveGoal(other, goalId)).rejects.toThrow();
    await expect(service.saveObjective(other, id, objective(goalId))).rejects.toThrow();
    await expect(service.cancelObjective(other, id)).rejects.toThrow();
    const otherGoal = await service.saveGoal(other, null, monthly);
    await expect(service.saveObjective(other, id, objective(otherGoal))).rejects.toThrow();
    await expect(service.saveObjective(userId, null, objective(otherGoal))).rejects.toThrow();
    const ownOtherGoal = await service.saveGoal(userId, null, weekly);
    await expect(service.saveObjective(userId, id, objective(ownOtherGoal))).rejects.toThrow();
  });
});
