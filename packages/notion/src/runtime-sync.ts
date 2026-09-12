import type { Sql } from "postgres";
import type { UserId } from "@amber/shared";
import type { WorkItemProcessor } from "./contracts.js";
import { NotionApiClient } from "./notion-client.js";
import { NotionSyncService, type NotionSyncResult } from "./notion-sync-service.js";
import { SupabaseNotionRepository } from "./supabase-notion-repository.js";

export async function syncNotionForUser(input: { readonly sql: Sql; readonly userId: UserId; readonly processor: WorkItemProcessor; readonly environment?: Readonly<Record<string, string | undefined>> }): Promise<NotionSyncResult | null> {
  const repository = new SupabaseNotionRepository(input.sql);
  const account = await repository.getActiveAccount(input.userId);
  if (!account) return null;
  if (account.secretRef !== "env:NOTION_API_TOKEN") throw new Error("Unsupported Notion secret reference");
  const token = (input.environment ?? process.env).NOTION_API_TOKEN?.trim();
  if (!token) throw new Error("NOTION_API_TOKEN is required for an active Notion account");
  return new NotionSyncService(new NotionApiClient(token), repository, input.processor).sync(account);
}
