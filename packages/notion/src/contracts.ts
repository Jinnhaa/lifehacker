import type { DiscoveredWorkItem } from "@amber/input";
import type { UserId } from "@amber/shared";

export const NOTION_SOURCE = "notion";
export const NOTION_API_VERSION = "2025-09-03";

export interface NotionIntegrationAccount {
  readonly id: string;
  readonly userId: UserId;
  readonly secretRef: string;
  readonly sourceIds: readonly string[];
}

export interface NotionWorkSourceClient {
  listWorkItems(sourceId: string, observedAt: Date): Promise<readonly DiscoveredWorkItem[]>;
}

export interface WorkItemProcessor {
  processDiscoveredWorkItem(userId: UserId, item: DiscoveredWorkItem): Promise<{ readonly status: string }>;
}
