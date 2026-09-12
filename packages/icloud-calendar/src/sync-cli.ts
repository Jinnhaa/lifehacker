import postgres from "postgres";
import { loadICloudCalendarConfig } from "./config.js";
import { saveICloudCalendarIntegrationAccount } from "./integration-account-setup.js";
import { syncICloudCalendarForUser } from "./runtime-sync.js";

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
  const result = await syncICloudCalendarForUser({ sql, userId: config.userId });
  if (!result) throw new Error("Exactly one active iCloud Calendar integration account is required");
  console.info(`iCloud Calendar sync complete: calendars=${result.discoveredCalendars} fetched=${result.fetchedCalendars} received=${result.received} active=${result.active} deleted=${result.deleted}`);
} finally {
  await sql.end();
}
