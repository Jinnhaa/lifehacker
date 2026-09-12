import { SystemClock, type Clock } from "@amber/shared";
import type { Sql } from "postgres";
import { CalendarSyncService } from "./calendar-sync-service.js";
import { loadGoogleCalendarConfig } from "./config.js";
import { LocalFileCalendarCredentialStore } from "./credential-store.js";
import { GoogleCalendarAdapter } from "./google-calendar-adapter.js";
import { createGoogleOAuthClient } from "./oauth.js";
import { SupabaseCalendarSyncRepository } from "./supabase-calendar-sync-repository.js";
import type { CalendarSyncResult } from "./contracts.js";

export async function syncGoogleCalendarForUser(input: {
  readonly sql: Sql;
  readonly userId: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly clock?: Clock;
}): Promise<CalendarSyncResult | null> {
  const repository = new SupabaseCalendarSyncRepository(input.sql);
  const account = await repository.getActiveAccount(input.userId);
  if (!account) return null;

  const environment = { ...(input.environment ?? process.env), AMBER_USER_ID: input.userId };
  const config = loadGoogleCalendarConfig(environment);
  const refreshToken = await new LocalFileCalendarCredentialStore(config.tokenStorePath).getRefreshToken(account.secretRef);
  if (!refreshToken) throw new Error("Google Calendar refresh token was not found in the configured secret store");
  const profiles = await input.sql<{ timezone: string }[]>`select timezone from public.profiles where id=${input.userId}`;
  if (!profiles[0]) throw new Error("Amber profile not found");

  const oauth = createGoogleOAuthClient(config);
  oauth.setCredentials({ refresh_token: refreshToken });
  return new CalendarSyncService(
    new GoogleCalendarAdapter({ auth: oauth, userTimeZone: profiles[0].timezone }),
    repository,
    input.clock ?? new SystemClock()
  ).sync(account);
}
