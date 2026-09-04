import postgres from "postgres";
import { SystemClock } from "@amber/shared";
import { loadGoogleCalendarConfig } from "./config.js";
import { LocalFileCalendarCredentialStore } from "./credential-store.js";
import { GoogleCalendarAdapter } from "./google-calendar-adapter.js";
import { createGoogleOAuthClient } from "./oauth.js";
import { CalendarSyncService } from "./calendar-sync-service.js";
import { SupabaseCalendarSyncRepository } from "./supabase-calendar-sync-repository.js";

const config = loadGoogleCalendarConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  const repository = new SupabaseCalendarSyncRepository(sql);
  const account = await repository.getActiveAccount(config.userId);
  if (!account) throw new Error("Exactly one active Google Calendar integration account is required");
  const refreshToken = await new LocalFileCalendarCredentialStore(config.tokenStorePath).getRefreshToken(account.secretRef);
  if (!refreshToken) throw new Error("Google Calendar refresh token was not found in the local secret store");
  const oauth = createGoogleOAuthClient(config);
  oauth.setCredentials({ refresh_token: refreshToken });
  const profile = await sql<{ timezone: string }[]>`select timezone from public.profiles where id=${config.userId}`;
  if (!profile[0]) throw new Error("Amber profile not found");
  const result = await new CalendarSyncService(
    new GoogleCalendarAdapter({ auth: oauth, userTimeZone: profile[0].timezone }),
    repository,
    new SystemClock()
  ).sync(account);
  console.info(`Calendar sync complete: mode=${result.mode} received=${result.received} active=${result.active} deleted=${result.deleted}`);
} finally {
  await sql.end();
}
