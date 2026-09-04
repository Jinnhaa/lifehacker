import { z } from "zod";
import { DEFAULT_ICLOUD_CALDAV_BASE_URL } from "./contracts.js";

const configSchema = z.object({
  AMBER_USER_ID: z.uuid(),
  ICLOUD_APPLE_ID: z.string().trim().min(1),
  ICLOUD_APP_PASSWORD: z.string().trim().regex(/^[a-z]{4}(?:-[a-z]{4}){3}$/i, "ICLOUD_APP_PASSWORD must be an Apple app-specific password"),
  ICLOUD_CALDAV_BASE_URL: z.url().optional(),
  DATABASE_URL: z.string().trim().min(1).optional()
}).strip();

export interface ICloudCalendarConfig {
  readonly userId: string;
  readonly appleId: string;
  readonly appPassword: string;
  readonly baseUrl: string;
  readonly databaseUrl: string;
}

export function loadICloudCalendarConfig(environment: Readonly<Record<string, string | undefined>> = process.env): ICloudCalendarConfig {
  const value = configSchema.parse(environment);
  return {
    userId: value.AMBER_USER_ID,
    appleId: value.ICLOUD_APPLE_ID,
    appPassword: value.ICLOUD_APP_PASSWORD,
    baseUrl: value.ICLOUD_CALDAV_BASE_URL ?? DEFAULT_ICLOUD_CALDAV_BASE_URL,
    databaseUrl: value.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  };
}
