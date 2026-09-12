import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { InputService, SupabaseInputRepository } from "@amber/input";
import { SystemClock } from "@amber/shared";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { loadNotionConfig } from "./config.js";
import { syncNotionForUser } from "./runtime-sync.js";

const config = loadNotionConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  const clock = new SystemClock();
  const processor = new InputService(
    new SupabaseInputRepository(sql),
    { parseInput: async () => { throw new Error("Natural-language parsing is unavailable in Notion sync"); } },
    new TaskService(new SupabaseTaskRepository(sql), clock)
  );
  const result = await syncNotionForUser({ sql, userId: config.userId as UserId, processor, environment: process.env });
  if (!result) throw new Error("Exactly one active Notion integration account with configured sources is required");
  console.info(`Notion sync complete: received=${result.received} materialized=${result.materialized} needs_confirmation=${result.needsConfirmation} dismissed=${result.dismissed}`);
} finally { await sql.end(); }
