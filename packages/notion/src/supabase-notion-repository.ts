import type { Sql } from "postgres";
import type { UserId } from "@amber/shared";
import { NOTION_SOURCE, type NotionIntegrationAccount } from "./contracts.js";

export class SupabaseNotionRepository {
  constructor(private readonly sql: Sql) {}

  async getActiveAccount(userId: string): Promise<NotionIntegrationAccount | null> {
    const rows = await this.sql<{ id: string; user_id: string; secret_ref: string | null; metadata: Record<string, unknown> }[]>`
      select id,user_id,secret_ref,metadata from public.integration_accounts
      where user_id=${userId} and provider=${NOTION_SOURCE} and status='active' order by created_at limit 2
    `;
    if (rows.length !== 1 || !rows[0]!.secret_ref) return null;
    const sourceIds = rows[0]!.metadata.sourceIds;
    if (!Array.isArray(sourceIds) || !sourceIds.every((value) => typeof value === "string" && value.trim())) return null;
    return { id: rows[0]!.id, userId: rows[0]!.user_id as UserId, secretRef: rows[0]!.secret_ref, sourceIds };
  }

  async markSynced(accountId: string, userId: string, at: Date): Promise<void> {
    await this.sql`update public.integration_accounts set last_sync_at=${at} where id=${accountId} and user_id=${userId}`;
  }
}
