import { z } from "zod";

export const LOCAL_SUPABASE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const discordWorkerEnvironmentSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().trim().min(1),
  DISCORD_ALLOWED_USER_ID: z.string().trim().regex(/^\d{17,20}$/),
  DATABASE_URL: z.string().trim().min(1).optional(),
  WAKE_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).optional(),
  AMBER_USER_ID: z.uuid().optional(),
  CALENDAR_SYNC_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).optional(),
  WORK_DISCOVERY_SYNC_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).optional()
}).strip();

export interface DiscordWorkerConfig {
  readonly botToken: string;
  readonly allowedDiscordUserId: string;
  readonly databaseUrl: string;
  readonly wakePollIntervalMs: number;
  readonly calendarUserId: string | null;
  readonly calendarSyncIntervalMs: number;
  readonly workDiscoverySyncIntervalMs: number;
}

export function loadDiscordWorkerConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): DiscordWorkerConfig {
  const parsed = discordWorkerEnvironmentSchema.parse(environment);
  return {
    botToken: parsed.DISCORD_BOT_TOKEN,
    allowedDiscordUserId: parsed.DISCORD_ALLOWED_USER_ID,
    databaseUrl: parsed.DATABASE_URL || LOCAL_SUPABASE_DATABASE_URL,
    wakePollIntervalMs: parsed.WAKE_POLL_INTERVAL_MS ?? 30_000,
    calendarUserId: parsed.AMBER_USER_ID ?? null,
    calendarSyncIntervalMs: parsed.CALENDAR_SYNC_INTERVAL_MS ?? 900_000,
    workDiscoverySyncIntervalMs: parsed.WORK_DISCOVERY_SYNC_INTERVAL_MS ?? 900_000
  };
}
