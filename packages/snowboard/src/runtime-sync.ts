import type { UserId } from "@amber/shared";
import type { SnowboardCollectorConfig, SnowboardWorkItemProcessor } from "./contracts.js";
import { PythonSnowboardClient } from "./python-client.js";
import { SnowboardSyncService, type SnowboardSyncResult } from "./snowboard-sync-service.js";

export async function syncSnowboardForUser(input: {
  readonly userId: UserId;
  readonly processor: SnowboardWorkItemProcessor;
  readonly config: SnowboardCollectorConfig;
}): Promise<SnowboardSyncResult> {
  return new SnowboardSyncService(new PythonSnowboardClient(), input.processor).sync(input.userId, input.config);
}
