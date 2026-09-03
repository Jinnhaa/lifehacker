import { randomUUID } from "node:crypto";
import { FixedClock } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseTaskRepository } from "./supabase-task-repository.js";
import { TaskService } from "./task-service.js";
const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = postgres(connectionString, { max: 5 });
const repository = SupabaseTaskRepository.connect(connectionString);
const userA = randomUUID();
const userB = randomUUID();
const ids = { generateCorrelationId: () => randomUUID() };
const eventFor = (taskId, userId, idempotencyKey) => ({
    userId,
    aggregateId: taskId,
    eventType: "task_started",
    actorType: "test",
    occurredAt: new Date("2026-09-03T01:00:00.000Z"),
    correlationId: randomUUID(),
    ...(idempotencyKey && { idempotencyKey }),
    payload: {
        previous_status: "INBOX",
        next_status: "IN_PROGRESS",
        source: "test",
        changed_at: "2026-09-03T01:00:00.000Z"
    }
});
const createTask = (userId, title) => repository.createTask({ userId, title, executionMode: "standard", importance: 3 }, {
    userId,
    eventType: "task_created",
    actorType: "test",
    occurredAt: new Date("2026-09-03T00:00:00.000Z"),
    correlationId: randomUUID(),
    payload: {
        previous_status: null,
        next_status: "INBOX",
        source: "test",
        changed_at: "2026-09-03T00:00:00.000Z"
    }
});
beforeAll(async () => {
    await admin `
    insert into auth.users(id,email,created_at,updated_at) values
      (${userA},${`core-${userA}@example.test`},now(),now()),
      (${userB},${`core-${userB}@example.test`},now(),now())
  `;
    await admin `insert into public.profiles(id) values (${userA}),(${userB})`;
});
afterAll(async () => {
    await admin `delete from auth.users where id in (${userA},${userB})`;
    await repository.close();
    await admin.end();
});
describe("SupabaseTaskRepository", () => {
    it("creates, reads, lists, and updates a task with one creation event", async () => {
        const task = await createTask(userA, "Repository task");
        expect((await repository.getTaskById(userA, task.id))?.title).toBe("Repository task");
        expect((await repository.listActiveTasks(userA)).some((item) => item.id === task.id)).toBe(true);
        expect((await repository.updateTask(userA, task.id, { title: "Updated task" }))?.title).toBe("Updated task");
        const events = await admin `
      select count(*)::integer as count from public.domain_events where aggregate_id=${task.id}
    `;
        expect(events[0]?.count).toBe(1);
    });
    it("blocks cross-user reads and writes", async () => {
        const task = await createTask(userA, "Private task");
        expect(await repository.getTaskById(userB, task.id)).toBeNull();
        expect(await repository.updateTask(userB, task.id, { title: "Leaked" })).toBeNull();
        expect((await repository.getTaskById(userA, task.id))?.title).toBe("Private task");
    });
    it("rolls back the state update when event insertion fails", async () => {
        const task = await createTask(userA, "Atomic task");
        const duplicateKey = `duplicate-${randomUUID()}`;
        await repository.appendDomainEvent({ ...eventFor(task.id, userA, duplicateKey), eventType: "task_created" });
        await expect(repository.transitionTask(userA, task.id, "INBOX", "IN_PROGRESS", null, eventFor(task.id, userA, duplicateKey))).rejects.toMatchObject({ code: "23505" });
        expect((await repository.getTaskById(userA, task.id))?.status).toBe("INBOX");
    });
    it("prevents stale overwrite during competing transitions", async () => {
        const task = await createTask(userA, "Concurrent task");
        const [first, second] = await Promise.all([
            repository.transitionTask(userA, task.id, "INBOX", "IN_PROGRESS", null, eventFor(task.id, userA)),
            repository.transitionTask(userA, task.id, "INBOX", "PLANNED", null, {
                ...eventFor(task.id, userA),
                eventType: "task_planned",
                payload: {
                    previous_status: "INBOX",
                    next_status: "PLANNED",
                    source: "test",
                    changed_at: "2026-09-03T01:00:00.000Z"
                }
            })
        ]);
        expect([first.kind, second.kind].sort()).toEqual(["stale", "updated"]);
        const events = await admin `
      select count(*)::integer as count from public.domain_events
      where aggregate_id=${task.id} and event_type in ('task_started','task_planned')
    `;
        expect(events[0]?.count).toBe(1);
    });
});
describe("TaskService", () => {
    it("validates, transitions, and emits exactly one event per successful state change", async () => {
        const clock = new FixedClock(new Date("2026-09-03T02:00:00.000Z"));
        const service = new TaskService(repository, clock, ids);
        const task = await service.createTask({
            userId: userA,
            title: "Service task",
            executionMode: "standard",
            importance: 4,
            source: "test"
        });
        clock.set(new Date("2026-09-03T02:05:00.000Z"));
        const planned = await service.planTask({ userId: userA, taskId: task.id, source: "test" });
        expect(planned.status).toBe("PLANNED");
        const events = await admin `
      select event_type,payload from public.domain_events where aggregate_id=${task.id} order by occurred_at
    `;
        expect(events.map((event) => event.event_type)).toEqual(["task_created", "task_planned"]);
        expect(events[1]?.payload.changed_at).toBe("2026-09-03T02:05:00.000Z");
    });
    it("writes no event for a rejected transition or cross-user request", async () => {
        const service = new TaskService(repository, new FixedClock(new Date("2026-09-03T03:00:00.000Z")), ids);
        const task = await service.createTask({ userId: userA, title: "Rejected task", importance: 3, source: "test" });
        await expect(service.completeTask({ userId: userA, taskId: task.id })).rejects.toMatchObject({
            code: "INVALID_TASK_TRANSITION"
        });
        await expect(service.startTask({ userId: userB, taskId: task.id })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
        const events = await admin `
      select count(*)::integer as count from public.domain_events where aggregate_id=${task.id}
    `;
        expect(events[0]?.count).toBe(1);
    });
});
//# sourceMappingURL=supabase-task-repository.integration.test.js.map