import postgres from "postgres";
import { loadNotionConfig } from "./config.js";
import { NOTION_SOURCE } from "./contracts.js";

const config = loadNotionConfig();
const sql = postgres(config.databaseUrl, { max: 2 });
try {
  const rows = await sql<{ id: string }[]>`select id from public.integration_accounts where user_id=${config.userId} and provider=${NOTION_SOURCE} order by created_at`;
  const metadata = { sourceIds: config.sourceIds };
  if (rows[0]) {
    await sql`update public.integration_accounts set status='active',secret_ref='env:NOTION_API_TOKEN',metadata=${sql.json(metadata)},connected_at=coalesce(connected_at,now()) where id=${rows[0].id} and user_id=${config.userId}`;
    for (const duplicate of rows.slice(1)) await sql`update public.integration_accounts set status='disabled' where id=${duplicate.id} and user_id=${config.userId}`;
  } else {
    await sql`insert into public.integration_accounts(user_id,provider,status,secret_ref,metadata,connected_at) values (${config.userId},${NOTION_SOURCE},'active','env:NOTION_API_TOKEN',${sql.json(metadata)},now())`;
  }
  console.info(`Notion read-only connection saved for ${config.sourceIds.length} configured source(s)`);
} finally { await sql.end(); }
