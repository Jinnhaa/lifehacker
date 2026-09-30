import { z } from "zod";

export const LOCAL_SUPABASE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const syncWorkerEnvironmentSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).optional(),
  AMBER_USER_ID: z.uuid().optional(),
  CALENDAR_SYNC_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).optional(),
  SNOWBOARD_SYNC_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).optional()
}).strip();

export interface SyncWorkerConfig {
  readonly databaseUrl: string;
  readonly userId: string | null;
  readonly calendarSyncIntervalMs: number;
  readonly snowboardSyncIntervalMs: number;
}

export function loadSyncWorkerConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): SyncWorkerConfig {
  const parsed = syncWorkerEnvironmentSchema.parse(environment);
  return {
    databaseUrl: parsed.DATABASE_URL || LOCAL_SUPABASE_DATABASE_URL,
    userId: parsed.AMBER_USER_ID ?? null,
    calendarSyncIntervalMs: parsed.CALENDAR_SYNC_INTERVAL_MS ?? 900_000,
    snowboardSyncIntervalMs: parsed.SNOWBOARD_SYNC_INTERVAL_MS ?? 900_000
  };
}
