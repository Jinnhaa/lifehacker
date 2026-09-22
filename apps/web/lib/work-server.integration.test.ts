import { randomUUID } from "node:crypto";
import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { DeterministicTestInterpreter, InputService, SupabaseInputRepository } from "@amber/input";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readWorkBoard } from "./work-server";

vi.mock("server-only", () => ({}));
vi.mock("@amber/core", async () => import("../../../packages/core/src/index.ts"));
vi.mock("@amber/input", async () => import("../../../packages/input/src/index.ts"));

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 5 });
const userId = randomUUID() as UserId;
const contextId = randomUUID();
const weeklyGoalId = randomUUID();
const objectiveId = randomUUID();
const clock = new FixedClock(new Date("2026-09-13T00:00:00.000Z"));
const taskRepository = new SupabaseTaskRepository(sql);
const taskService = new TaskService(taskRepository, clock);
const inputRepository = new SupabaseInputRepository(sql);
const candidateInterpreter = new DeterministicTestInterpreter((input) => ({
  intent: "CREATE_TASK",
  entities: [{
    entityType: "task_candidate",
    data: { title: input.text, inferredFields: [] },
    provenance: { title: "user_explicit" },
    confidence: 0.7
  }],
  requiresConfirmation: true,
  clarificationQuestions: ["이 항목을 할 일로 만들까요?"]
}));
const inputService = new InputService(inputRepository, candidateInterpreter, taskService);

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values (${userId},${`work-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values (${userId},'Asia/Seoul')`;
  await sql`insert into public.user_settings(user_id,planning_buffer_minutes,week_starts_on) values(${userId},15,1)`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode) values (${contextId},${userId},'project','Work Board Project','active','auto')`;
  await sql`insert into public.goals(id,user_id,title,importance,status,origin,level,period_start,period_end)
    values(${weeklyGoalId},${userId},'Weekly Win',4,'active','user','WEEKLY','2026-09-07','2026-09-13')`;
  await sql`insert into public.objectives(id,user_id,goal_id,work_context_id,title,success_criteria,importance,status,origin)
    values(${objectiveId},${userId},${weeklyGoalId},${contextId},'Weekly milestone','완료',4,'active','user')`;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("Work Board V1", () => {
  it("shows canonical work together and applies candidate and Task corrections", async () => {
    const manual = await taskService.createTask({
      userId, title: "오늘 수동 업무", officialDeadline: new Date("2026-09-13T06:00:00.000Z"),
      internalDeadline: new Date("2026-09-15T06:00:00.000Z"), estimatedMinutes: 20, importance: 3, source: "snowboard",
      workContextId: contextId, objectiveId
    });
    await sql`insert into public.external_references(user_id,source,external_type,external_id,ownership,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at)
      values (${userId},'snowboard','assignment',${randomUUID()},'external','task',${manual.id},'active',now(),now())`;
    const notion = await taskService.createTask({ userId, title: "Notion 업무", importance: 3, source: "notion" });
    await sql`insert into public.external_references(user_id,source,external_type,external_id,ownership,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at)
      values (${userId},'notion','notion_page',${randomUUID()},'external','task',${notion.id},'active',now(),now())`;
    await taskService.createTask({ userId, title: "Project AI 업무", importance: 3, source: "backlog_approval" });
    const quick = await taskService.createTask({ userId, title: "빠른 추가 업무", importance: 3, source: "work_board" });
    const pending = await inputService.processManualText({
      userId, text: "확인할 후보", source: "manual", clientRequestId: `candidate-${randomUUID()}`,
      receivedAt: "2026-09-13T09:00:00+09:00"
    });
    expect(pending.status).toBe("waiting_for_confirmation");
    const confirmable = await inputService.processManualText({
      userId, text: "수정해서 확인할 후보", source: "manual", clientRequestId: `candidate-${randomUUID()}`,
      receivedAt: "2026-09-13T09:01:00+09:00"
    });
    expect(confirmable.status).toBe("waiting_for_confirmation");

    const board = await readWorkBoard(sql, userId, "Asia/Seoul", new Date("2026-09-13T01:00:00.000Z"));
    expect(board.candidates.map((item) => item.title)).toContain("확인할 후보");
    const visible = board.week.flatMap((day) => day.tasks);
    expect(visible.map((task) => task.title)).toEqual(expect.arrayContaining(["오늘 수동 업무", "Notion 업무", "Project AI 업무", "빠른 추가 업무"]));
    expect(visible.find((task) => task.id === manual.id)).toMatchObject({
      officialDeadlineLabel: expect.any(String),
      internalDeadlineLabel: expect.any(String),
      goalTitle: "Weekly Win"
    });
    expect(board.week).toHaveLength(7);
    expect(board.weeklyWins[0]).toMatchObject({ title: "Weekly Win", progress: 0, remainingMinutes: 20 });

    const corrected = await taskService.updateTask({
      userId, taskId: manual.id, title: "수정된 업무", internalDeadline: new Date("2026-09-12T06:00:00.000Z"),
      estimatedMinutes: 45, plannedDate: "2026-09-11", workContextId: contextId, source: "work_board"
    });
    expect(corrected).toMatchObject({
      title: "수정된 업무",
      officialDeadline: new Date("2026-09-13T06:00:00.000Z"),
      internalDeadline: new Date("2026-09-12T06:00:00.000Z"),
      estimatedMinutes: 45,
      plannedDate: "2026-09-11",
      workContextId: contextId
    });
    if (confirmable.status !== "waiting_for_confirmation") throw new Error("Expected confirmable candidate");
    const confirmed = await inputService.decideTaskCandidate({
      userId, parsedEntityId: confirmable.parsedEntityId, decision: "confirm", title: "확정된 후보",
      officialDeadline: new Date("2026-09-16T06:00:00.000Z"), estimatedMinutes: 35, workContextId: contextId
    });
    expect(confirmed.status).toBe("applied");
    const confirmedTask = await taskRepository.getTaskById(userId, confirmed.status === "applied" ? confirmed.taskId : manual.id);
    expect(confirmedTask).toMatchObject({ title: "확정된 후보", estimatedMinutes: 35, workContextId: contextId });
    await taskService.planTask({ userId, taskId: quick.id, source: "work_board" });
    await taskService.completeTask({ userId, taskId: quick.id, source: "work_board" });

    if (pending.status !== "waiting_for_confirmation") throw new Error("Expected pending candidate");
    await inputService.decideTaskCandidate({ userId, parsedEntityId: pending.parsedEntityId, decision: "dismiss" });
    const refreshed = await readWorkBoard(sql, userId, "Asia/Seoul", new Date("2026-09-13T01:00:00.000Z"));
    expect(refreshed.candidates.map((item) => item.title)).not.toContain("확인할 후보");
    expect(refreshed.week.flatMap((day) => day.tasks).map((task) => task.id)).not.toContain(quick.id);
    expect(refreshed.week.flatMap((day) => day.tasks).find((task) => task.id === manual.id)).toMatchObject({
      officialDeadlineLabel: expect.any(String),
      internalDeadlineLabel: expect.any(String),
      plannedDate: "2026-09-11"
    });
    await taskService.planTask({ userId, taskId: manual.id, source: "work_board" });
    await taskService.completeTask({ userId, taskId: manual.id, source: "work_board" });
    const completed = await readWorkBoard(sql, userId, "Asia/Seoul", new Date("2026-09-13T01:00:00.000Z"));
    expect(completed.weeklyWins[0]).toMatchObject({ title: "Weekly Win", progress: 100, remainingMinutes: 0 });
    const dismissedTasks = await sql<{ count: number }[]>`select count(*)::int count from public.tasks where user_id=${userId} and title='확인할 후보'`;
    expect(dismissedTasks[0]?.count).toBe(0);
  });
});
