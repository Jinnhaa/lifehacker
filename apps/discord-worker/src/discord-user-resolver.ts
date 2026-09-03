import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";

export interface DiscordUserIdentity {
  readonly userId: UserId;
  readonly timeZone: string;
}

export interface DiscordUserResolver {
  resolve(discordUserId: string): Promise<DiscordUserIdentity | null>;
}

export class SupabaseDiscordUserResolver implements DiscordUserResolver {
  constructor(private readonly sql: Sql) {}

  async resolve(discordUserId: string): Promise<DiscordUserIdentity | null> {
    const rows = await this.sql<{ user_id: string; timezone: string }[]>`
      select account.user_id,profile.timezone
      from public.integration_accounts account
      join public.profiles profile on profile.id=account.user_id
      where account.provider='discord'
        and account.external_account_id=${discordUserId}
        and account.status='active'
      order by account.created_at
      limit 2
    `;
    if (rows.length !== 1) return null;
    return { userId: rows[0]!.user_id as UserId, timeZone: rows[0]!.timezone };
  }
}
