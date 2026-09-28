import { randomUUID } from "node:crypto";
import {
  getHomeOutcome,
  SupabaseFocusRepository,
  SupabaseMorningRepository,
  SupabaseTaskRepository,
  TaskService
} from "@amber/core";
import { DeterministicTestInterpreter, InputService, SupabaseInputRepository } from "@amber/input";
import { FixedClock, type TaskId, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mapHomeChief } from "./home-chief-presentation";
import { readWorkBoard } from "./work-server";

vi.mock("server-only", () => ({}));
vi.mock("@amber/core", async () => import("../../../packages/core/src/index"));
vi.mock("@amber/input", async () => import("../../../packages/input/src/index"));

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const owner = randomUUID() as UserId;
const activeId = randomUUID() as TaskId;
const secondId = randomUUID() as TaskId;
const thirdId = randomUUID() as TaskId;
const hardId = randomUUID() as TaskId;
const constraintId = randomUUID();
const now = new Date("2026-09-26T09:00:00+09:00");
const clock = new FixedClock(now);
const taskService = new TaskService(new SupabaseTaskRepository(sql), clock);
const inputService = new InputService(
  new SupabaseInputRepository(sql),
  new DeterministicTestInterpreter((input) => ({
    intent: "CREATE_TASK",
    entities: [{ entityType: "task_candidate", data: { title: input.text, inferredFields: [] }, provenance: { title: "user_explicit" }, confidence: 0.7 }],
    requiresConfirmation: true,
    clarificationQuestions: ["이 항목을 할 일로 만들까요?"]
  })),
  taskService
);
const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External API must not be called"));

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values(${owner},${`work-chief-${owner}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${owner},'Asia/Seoul')`;
  await sql`insert into public.user_settings(user_id,planning_buffer_minutes,week_starts_on,planning_policy)
    values(${owner},15,1,${sql.json({ defaultWorkUntil: "18:00" })})`;
  await sql`insert into public.tasks(id,user_id,title,execution_mode,importance,status,estimated_user_minutes)
    values
      (${activeId},${owner},'Active candidate','standard',5,'PLANNED',20),
      (${secondId},${owner},'Second candidate','standard',4,'PLANNED',20),
      (${thirdId},${owner},'Third candidate','standard',3,'PLANNED',20)`;
  await sql`insert into public.constraints(id,user_id,constraint_type,value,hardness,valid_from,valid_until,reason,origin)
    values(${constraintId},${owner},'availability',${sql.json({ title: "Fixed meeting", blocksCapacity: true, syncStatus: "active" })},'hard','2026-09-26T10:00:00+09:00','2026-09-26T11:00:00+09:00','fixed event','icloud_calendar')`;
  await sql`insert into public.external_references(user_id,source,external_type,external_id,ownership,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at)
    values(${owner},'icloud_calendar','calendar_event',${`event-${constraintId}`},'external','constraint',${constraintId},'active',now(),now())`;
  await inputService.processManualText({ userId: owner, text: "Unselected inventory", source: "manual", clientRequestId: `candidate-${owner}`, receivedAt: now.toISOString() });
});

afterAll(async () => {
  fetchSpy.mockRestore();
  await sql`delete from auth.users where id=${owner}`;
  await sql.end();
});

describe("Work Today canonical Chief server integration", () => {
  it("matches Home Main identity and canonical order without a Morning plan", async () => {
    const board = await readWorkBoard(sql, owner, "Asia/Seoul", now);
    const observation = await new SupabaseMorningRepository(sql).loadObservation(owner, "2026-09-26", "Asia/Seoul");
    const outcome = await getHomeOutcome(sql, owner, "2026-09-26", observation, now);
    const home = mapHomeChief(outcome.judgment, observation.tasks.map((item) => ({
      id: item.id, title: item.title, context: null, completionCriteria: item.completionCriteria, scopeExclusions: null
    })));
    expect(board.todayQuests.map((item) => item.id)).toEqual(outcome.judgment.todayPriority.map((item) => item.taskId));
    expect(board.todayQuests[0]?.id).toBe(home.currentAction?.taskId);
    expect(board.todayCapacityMinutes).toBeNull();
    expect(board.candidates.map((item) => item.title)).toContain("Unselected inventory");
    expect(board.todayEvents).toMatchObject([{ title: "Fixed meeting" }]);
    expect(board.week).toHaveLength(7);
    expect(board.month).toHaveLength(42);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not gate ordered Quests on pending Morning approval", async () => {
    await sql`insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,created_by)
      values(${owner},'2026-09-26','Asia/Seoul',1,'pending_approval','system')`;
    const board = await readWorkBoard(sql, owner, "Asia/Seoul", now);
    expect(board.todayQuests[0]?.id).toBe(activeId);
    expect(board.todayQuests).toHaveLength(3);
  });

  it("keeps the existing Today capacity and fixed-calendar projections", async () => {
    await sql`insert into public.daily_plans(user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by,approved_at)
      values(${owner},'2026-09-26','Asia/Seoul',2,'approved',${sql.json({ workUntil: "2026-09-26T18:00:00+09:00" })},'system',now())`;
    const board = await readWorkBoard(sql, owner, "Asia/Seoul", now);
    expect(board.todayCapacityMinutes).toBe(465);
    expect(board.todayEvents.map((item) => item.title)).toEqual(["Fixed meeting"]);
    expect(board.week.find((day) => day.isToday)?.events.map((item) => item.id)).toEqual([constraintId]);
    expect(board.month).toHaveLength(42);
  });

  it("changes displayed #1 for stronger evidence without stopping or switching Focus", async () => {
    await new SupabaseFocusRepository(sql).start(owner, "2026-09-26", now, `work-focus:${owner}`, 25, "Asia/Seoul", { kind: "task", id: activeId });
    const continuous = await readWorkBoard(sql, owner, "Asia/Seoul", now);
    expect(continuous.todayQuests[0]?.id).toBe(activeId);
    await sql`insert into public.tasks(id,user_id,title,execution_mode,importance,status,estimated_user_minutes,official_deadline)
      values(${hardId},${owner},'Hard deadline','standard',3,'PLANNED',20,'2026-09-26T23:59:00+09:00')`;
    const before = await sql<{ id: string; task_id: string; status: string }[]>`select id,task_id,status from public.focus_sessions where user_id=${owner} and status='active'`;
    const changed = await readWorkBoard(sql, owner, "Asia/Seoul", now);
    const after = await sql<{ id: string; task_id: string; status: string }[]>`select id,task_id,status from public.focus_sessions where user_id=${owner} and status='active'`;
    expect(changed.todayQuests[0]?.id).toBe(hardId);
    expect(after).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
