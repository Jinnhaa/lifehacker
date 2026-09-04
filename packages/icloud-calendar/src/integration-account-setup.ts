import type postgres from "postgres";
import type { Sql } from "postgres";
import { ICLOUD_CALENDAR_SOURCE } from "./contracts.js";

export async function saveICloudCalendarIntegrationAccount(input: {
  sql: Sql;
  userId: string;
  externalAccountId: string;
  baseUrl: string;
  connectedAt: Date;
}): Promise<string> {
  return input.sql.begin(async (tx) => {
    const existing = await tx<{ id: string; metadata: Record<string, unknown> }[]>`
      select id,metadata from public.integration_accounts
      where user_id=${input.userId} and provider=${ICLOUD_CALENDAR_SOURCE} and external_account_id=${input.externalAccountId}
      order by created_at limit 1 for update
    `;
    const metadata = { ...(existing[0]?.metadata ?? {}), caldavBaseUrl: input.baseUrl };
    if (existing[0]) {
      await tx`update public.integration_accounts set status='active',secret_ref='env:ICLOUD_APP_PASSWORD',metadata=${tx.json(metadata as postgres.JSONValue)},connected_at=${input.connectedAt} where id=${existing[0].id} and user_id=${input.userId}`;
      return existing[0].id;
    }
    const rows = await tx<{ id: string }[]>`
      insert into public.integration_accounts(user_id,provider,external_account_id,status,secret_ref,metadata,connected_at)
      values (${input.userId},${ICLOUD_CALENDAR_SOURCE},${input.externalAccountId},'active','env:ICLOUD_APP_PASSWORD',${tx.json(metadata as postgres.JSONValue)},${input.connectedAt}) returning id
    `;
    return rows[0]!.id;
  });
}
