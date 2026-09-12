import { SystemClock, type Clock } from "@amber/shared";
import type { Sql } from "postgres";
import { ICloudCalendarSyncService } from "./calendar-sync-service.js";
import { loadICloudCalendarConfig } from "./config.js";
import { ICloudCalDavAdapter } from "./icloud-caldav-adapter.js";
import { SupabaseICloudCalendarSyncRepository } from "./supabase-calendar-sync-repository.js";
import type { ICloudSyncResult } from "./contracts.js";

export async function syncICloudCalendarForUser(input: {
  readonly sql: Sql;
  readonly userId: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly clock?: Clock;
}): Promise<ICloudSyncResult | null> {
  const repository = new SupabaseICloudCalendarSyncRepository(input.sql);
  const account = await repository.getActiveAccount(input.userId);
  if (!account) return null;

  const environment = { ...(input.environment ?? process.env), AMBER_USER_ID: input.userId };
  const config = loadICloudCalendarConfig(environment);
  const profiles = await input.sql<{ timezone: string }[]>`select timezone from public.profiles where id=${input.userId}`;
  if (!profiles[0]) throw new Error("Amber profile not found");

  return new ICloudCalendarSyncService(
    new ICloudCalDavAdapter({
      baseUrl: config.baseUrl,
      appleId: config.appleId,
      appPassword: config.appPassword,
      userTimeZone: profiles[0].timezone
    }),
    repository,
    input.clock ?? new SystemClock()
  ).sync(account);
}
