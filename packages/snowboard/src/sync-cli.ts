import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { InputService, SupabaseInputRepository } from "@amber/input";
import { SystemClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { loadSnowboardConfig } from "./config.js";
import { PythonSnowboardClient } from "./python-client.js";
import { SnowboardSyncService } from "./snowboard-sync-service.js";
import { SupabaseAcademicScheduleRepository } from "./supabase-academic-schedule-repository.js";

const config = loadSnowboardConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  const processor = new InputService(
    new SupabaseInputRepository(sql),
    { parseInput: async () => { throw new Error("Natural-language parsing is unavailable in Snowboard sync"); } },
    new TaskService(new SupabaseTaskRepository(sql), new SystemClock())
  );
  const client = new PythonSnowboardClient();
  const result = await new SnowboardSyncService(client, processor).sync(config.userId as UserId, config.collector);
  const schedules = await client.listAcademicSchedules(config.collector);
  const scheduleResult = await new SupabaseAcademicScheduleRepository(sql).applySchedules(config.userId as UserId, schedules);
  console.info(
    `Snowboard sync complete: assignments=${result.assignments} quizzes=${result.quizzes} completion_signals=${result.completionSignals} ` +
    `materialized=${result.materialized} needs_confirmation=${result.needsConfirmation} dismissed=${result.dismissed} ` +
    `schedules=${scheduleResult.received} schedule_created=${scheduleResult.created} schedule_updated=${scheduleResult.updated} schedule_unchanged=${scheduleResult.unchanged}`
  );
} finally {
  await sql.end();
}
