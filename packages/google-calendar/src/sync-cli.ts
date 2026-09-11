import postgres from "postgres";
import { loadGoogleCalendarConfig } from "./config.js";
import { syncGoogleCalendarForUser } from "./runtime-sync.js";

const config = loadGoogleCalendarConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  const result = await syncGoogleCalendarForUser({ sql, userId: config.userId });
  if (!result) throw new Error("Exactly one active Google Calendar integration account is required");
  console.info(`Calendar sync complete: mode=${result.mode} received=${result.received} active=${result.active} deleted=${result.deleted}`);
} finally {
  await sql.end();
}
