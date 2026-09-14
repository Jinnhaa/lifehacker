import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { Sql } from "postgres";
import type { IntegrationAccount } from "./integration-settings.js";
import type { IntegrationSettingsRepository } from "./integration-settings-repository.js";

interface AccountRow {
  id: string;
  user_id: string;
  provider: string;
  external_account_id: string | null;
  status: string;
  secret_ref: string | null;
  metadata: Record<string, unknown>;
  connected_at: Date | null;
  last_sync_at: Date | null;
  created_at: Date;
}

const mapAccount = (row: AccountRow): IntegrationAccount => ({
  id: row.id, userId: row.user_id, provider: row.provider,
  externalAccountId: row.external_account_id, status: row.status, secretRef: row.secret_ref,
  metadata: row.metadata, connectedAt: row.connected_at, lastSyncAt: row.last_sync_at, createdAt: row.created_at
});

export class SupabaseIntegrationSettingsRepository implements IntegrationSettingsRepository {
  constructor(private readonly sql: Sql) {}

  async listAccounts(userId: string): Promise<readonly IntegrationAccount[]> {
    const rows = await this.sql<AccountRow[]>`
      select id,user_id,provider,external_account_id,status,secret_ref,metadata,connected_at,last_sync_at,created_at
      from public.integration_accounts where user_id=${userId}
      order by created_at desc
    `;
    return rows.map(mapAccount);
  }

  async setAccountEnabled(input: {
    readonly userId: string;
    readonly accountId: string;
    readonly enabled: boolean;
    readonly changedAt: Date;
  }): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string; provider: string; status: string }[]>`
        select id,provider,status from public.integration_accounts
        where id=${input.accountId} and user_id=${input.userId} for update
      `;
      const current = rows[0];
      if (!current) return false;
      const nextStatus = input.enabled ? "active" : "disabled";
      if (current.status === nextStatus) return true;
      if (input.enabled) {
        await tx`
          update public.integration_accounts set status='disabled'
          where user_id=${input.userId} and provider=${current.provider} and id<>${current.id} and status='active'
        `;
      }
      await tx`update public.integration_accounts set status=${nextStatus} where id=${current.id} and user_id=${input.userId}`;
      await tx`
        insert into public.domain_events(
          user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,payload_version,payload
        ) values (
          ${input.userId},${input.enabled ? "integration_activated" : "integration_deactivated"},
          'integration_account',${current.id},'user',${input.changedAt},${randomUUID()},1,
          ${tx.json({ provider: current.provider, previous_status: current.status, next_status: nextStatus } as postgres.JSONValue)}
        )
      `;
      return true;
    });
  }
}

