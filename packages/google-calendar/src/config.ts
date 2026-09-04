import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const baseSchema = z.object({
  AMBER_USER_ID: z.uuid(),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().trim().min(1),
  GOOGLE_CALENDAR_REDIRECT_URI: z.url(),
  GOOGLE_CALENDAR_TOKEN_STORE_PATH: z.string().trim().min(1).optional(),
  DATABASE_URL: z.string().trim().min(1).optional()
}).strip();

export interface GoogleCalendarConfig {
  readonly userId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly tokenStorePath: string;
  readonly databaseUrl: string;
}

export function loadGoogleCalendarConfig(environment: Readonly<Record<string, string | undefined>> = process.env): GoogleCalendarConfig {
  const value = baseSchema.parse(environment);
  return {
    userId: value.AMBER_USER_ID,
    clientId: value.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: value.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri: value.GOOGLE_CALENDAR_REDIRECT_URI,
    tokenStorePath: value.GOOGLE_CALENDAR_TOKEN_STORE_PATH ?? join(homedir(), ".amber-hq", "google-calendar-tokens.json"),
    databaseUrl: value.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  };
}
