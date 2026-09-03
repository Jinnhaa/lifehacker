import { z } from "zod";

export const LOCAL_SUPABASE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const discordWorkerEnvironmentSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().trim().min(1),
  DISCORD_ALLOWED_USER_ID: z.string().trim().regex(/^\d{17,20}$/),
  DATABASE_URL: z.string().trim().min(1).optional()
}).strip();

export interface DiscordWorkerConfig {
  readonly botToken: string;
  readonly allowedDiscordUserId: string;
  readonly databaseUrl: string;
}

export function loadDiscordWorkerConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): DiscordWorkerConfig {
  const parsed = discordWorkerEnvironmentSchema.parse(environment);
  return {
    botToken: parsed.DISCORD_BOT_TOKEN,
    allowedDiscordUserId: parsed.DISCORD_ALLOWED_USER_ID,
    databaseUrl: parsed.DATABASE_URL || LOCAL_SUPABASE_DATABASE_URL
  };
}
