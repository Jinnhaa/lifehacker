import postgres from "postgres";
import { google } from "googleapis";
import { loadGoogleCalendarConfig } from "./config.js";
import { LocalFileCalendarCredentialStore } from "./credential-store.js";
import { saveGoogleCalendarIntegrationAccount } from "./integration-account-setup.js";
import { createGoogleOAuthClient, createReadOnlyAuthorizationUrl } from "./oauth.js";

const config = loadGoogleCalendarConfig();
const oauth = createGoogleOAuthClient(config);
const code = process.env.GOOGLE_CALENDAR_AUTH_CODE?.trim();

if (!code) {
  console.info("Open this read-only Google authorization URL, then set GOOGLE_CALENDAR_AUTH_CODE and run again:");
  console.info(createReadOnlyAuthorizationUrl(oauth));
} else {
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token; re-authorize with consent");
  oauth.setCredentials({ refresh_token: tokens.refresh_token });
  const calendar = google.calendar({ version: "v3", auth: oauth });
  const primary = await calendar.calendars.get({ calendarId: "primary" });
  if (!primary.data.id) throw new Error("Primary calendar id was not returned");
  const secretRef = `google-calendar:${config.userId}:primary`;
  await new LocalFileCalendarCredentialStore(config.tokenStorePath).saveRefreshToken(secretRef, tokens.refresh_token);
  const sql = postgres(config.databaseUrl, { max: 2 });
  try {
    await saveGoogleCalendarIntegrationAccount({
      sql,
      userId: config.userId,
      externalAccountId: primary.data.id,
      secretRef,
      calendarTimeZone: primary.data.timeZone ?? "UTC",
      connectedAt: new Date()
    });
  } finally {
    await sql.end();
  }
  console.info("Google Calendar read-only connection saved");
}
