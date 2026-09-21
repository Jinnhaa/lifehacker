import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { InputService, SupabaseInputRepository } from "@amber/input";
import { SystemClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { loadSnowboardConfig } from "./config.js";
import { CourseContextBootstrapService } from "./course-context-bootstrap.js";
import { PythonSnowboardClient } from "./python-client.js";
import { SnowboardSyncService } from "./snowboard-sync-service.js";
import { SupabaseAcademicScheduleRepository } from "./supabase-academic-schedule-repository.js";
import { SupabaseCourseContextBootstrapRepository } from "./supabase-course-context-bootstrap-repository.js";

const config = loadSnowboardConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  const client = new PythonSnowboardClient();
  const courses = await new CourseContextBootstrapService(
    client,
    new SupabaseCourseContextBootstrapRepository(sql)
  ).bootstrap(config.userId as UserId, config.collector);
  const processor = new InputService(
    new SupabaseInputRepository(sql),
    { parseInput: async () => { throw new Error("Natural-language parsing is unavailable in Snowboard sync"); } },
    new TaskService(new SupabaseTaskRepository(sql), new SystemClock())
  );
  const assignments = await new SnowboardSyncService(client, processor).sync(config.userId as UserId, config.collector);
  const schedules = await client.listAcademicSchedules(config.collector);
  const scheduleResult = await new SupabaseAcademicScheduleRepository(sql).applySchedules(config.userId as UserId, schedules);
  console.info(
    `Snowboard bootstrap complete: courses=${courses.discovered} created=${courses.created} reused=${courses.reused} ` +
    `assignments=${assignments.assignments} quizzes=${assignments.quizzes} completion_signals=${assignments.completionSignals} ` +
    `materialized=${assignments.materialized} needs_confirmation=${assignments.needsConfirmation} ` +
    `schedules=${scheduleResult.received} schedule_created=${scheduleResult.created} schedule_updated=${scheduleResult.updated} schedule_unchanged=${scheduleResult.unchanged}`
  );
} finally {
  await sql.end();
}
