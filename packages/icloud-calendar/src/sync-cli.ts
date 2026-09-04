import { SystemClock } from "@amber/shared";
import postgres from "postgres";
import { ICloudCalendarSyncService } from "./calendar-sync-service.js";
import { loadICloudCalendarConfig } from "./config.js";
import { ICloudCalDavAdapter } from "./icloud-caldav-adapter.js";
import { saveICloudCalendarIntegrationAccount } from "./integration-account-setup.js";
import { SupabaseICloudCalendarSyncRepository } from "./supabase-calendar-sync-repository.js";

const config = loadICloudCalendarConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  await saveICloudCalendarIntegrationAccount({
    sql,
    userId: config.userId,
    externalAccountId: config.appleId,
    baseUrl: config.baseUrl,
    connectedAt: new Date()
  });
  const repository = new SupabaseICloudCalendarSyncRepository(sql);
  const account = await repository.getActiveAccount(config.userId);
  if (!account) throw new Error("Exactly one active iCloud Calendar integration account is required");
  const profile = await sql<{ timezone: string }[]>`select timezone from public.profiles where id=${config.userId}`;
  if (!profile[0]) throw new Error("Amber profile not found");
  const result = await new ICloudCalendarSyncService(
    new ICloudCalDavAdapter({
      baseUrl: config.baseUrl,
      appleId: config.appleId,
      appPassword: config.appPassword,
      userTimeZone: profile[0].timezone
    }),
    repository,
    new SystemClock()
  ).sync(account);
  console.info(`iCloud Calendar sync complete: calendars=${result.discoveredCalendars} fetched=${result.fetchedCalendars} received=${result.received} active=${result.active} deleted=${result.deleted}`);
} finally {
  await sql.end();
}
