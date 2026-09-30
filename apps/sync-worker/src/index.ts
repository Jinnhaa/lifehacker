import postgres from "postgres";
import { InputService, SupabaseInputRepository } from "@amber/input";
import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { syncGoogleCalendarForUser } from "@amber/google-calendar";
import { syncICloudCalendarForUser } from "@amber/icloud-calendar";
import { loadSnowboardConfig, PythonSnowboardClient, SnowboardSyncService, SupabaseAcademicScheduleRepository } from "@amber/snowboard";
import { PeriodicSyncScheduler, SystemClock, type UserId } from "@amber/shared";
import { loadSyncWorkerConfig } from "./config.js";

const config = loadSyncWorkerConfig();
const sql = postgres(config.databaseUrl, { max: 10 });
const clock = new SystemClock();
const taskRepository = new SupabaseTaskRepository(sql);
const inputRepository = new SupabaseInputRepository(sql);

const hasEnvironmentValues = (keys: readonly string[]): boolean => keys.every((key) => Boolean(process.env[key]));
const calendarUserId = config.userId as UserId | null;
const googleSyncEnabled = calendarUserId !== null && hasEnvironmentValues([
  "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_REDIRECT_URI"
]);
const iCloudSyncEnabled = calendarUserId !== null && hasEnvironmentValues(["ICLOUD_APPLE_ID", "ICLOUD_APP_PASSWORD"]);
const snowboardSyncEnabled = calendarUserId !== null && hasEnvironmentValues([
  "SNOWBOARD_USERNAME", "SNOWBOARD_PASSWORD", "SNOWBOARD_CURRENT_TERM", "SNOWBOARD_REGULAR_COURSE_IDS"
]);

const calendarSyncScheduler = new PeriodicSyncScheduler([
  ...(googleSyncEnabled ? [{
    provider: "google_calendar",
    sync: () => syncGoogleCalendarForUser({ sql, userId: calendarUserId!, environment: process.env, clock })
  }] : []),
  ...(iCloudSyncEnabled ? [{
    provider: "icloud_calendar",
    sync: () => syncICloudCalendarForUser({ sql, userId: calendarUserId!, environment: process.env, clock })
  }] : [])
], config.calendarSyncIntervalMs);

const snowboardSyncScheduler = new PeriodicSyncScheduler(snowboardSyncEnabled ? [{
  provider: "snowboard",
  sync: async () => {
    const snowboard = loadSnowboardConfig(process.env);
    const processor = new InputService(
      inputRepository,
      { parseInput: async () => { throw new Error("Natural-language parsing is unavailable in Snowboard sync"); } },
      new TaskService(taskRepository, clock)
    );
    const client = new PythonSnowboardClient();
    const result = await new SnowboardSyncService(client, processor).sync(snowboard.userId as UserId, snowboard.collector);
    const schedules = await client.listAcademicSchedules(snowboard.collector);
    const scheduleResult = await new SupabaseAcademicScheduleRepository(sql).applySchedules(snowboard.userId as UserId, schedules);
    return { ...result, schedules: scheduleResult };
  }
}] : [], config.snowboardSyncIntervalMs);

if (!calendarUserId) {
  console.info("Sync worker disabled: AMBER_USER_ID is not configured");
} else {
  if (googleSyncEnabled) calendarSyncScheduler.start();
  else console.info("Google Calendar sync skipped: credentials are not configured");
  if (iCloudSyncEnabled) calendarSyncScheduler.start();
  else console.info("iCloud Calendar sync skipped: credentials are not configured");
  if (snowboardSyncEnabled) snowboardSyncScheduler.start();
  else console.info("Snowboard sync skipped: credentials, current term, or regular course ids are not configured");
}

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  calendarSyncScheduler.stop();
  snowboardSyncScheduler.stop();
  await sql.end();
  console.info("Sync worker stopped");
};

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
