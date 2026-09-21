import type { UserId } from "@amber/shared";
import type { SnowboardAssignmentClient, SnowboardCollectorConfig, SnowboardWorkItemProcessor } from "./contracts.js";

export interface SnowboardSyncResult {
  readonly received: number;
  readonly assignments: number;
  readonly quizzes: number;
  readonly completionSignals: number;
  readonly materialized: number;
  readonly needsConfirmation: number;
  readonly dismissed: number;
}

export class SnowboardSyncService {
  constructor(
    private readonly client: SnowboardAssignmentClient,
    private readonly processor: SnowboardWorkItemProcessor
  ) {}

  async sync(userId: UserId, config: SnowboardCollectorConfig): Promise<SnowboardSyncResult> {
    const items = await this.client.listAssignments(config);
    let materialized = 0;
    let needsConfirmation = 0;
    let dismissed = 0;
    for (const item of items) {
      const result = await this.processor.processDiscoveredWorkItem(userId, item);
      if (result.status === "materialized") materialized += 1;
      else if (result.status === "needs_confirmation") needsConfirmation += 1;
      else if (result.status === "dismissed") dismissed += 1;
    }
    return {
      received: items.length,
      assignments: items.filter((item) => item.externalType !== "quiz").length,
      quizzes: items.filter((item) => item.externalType === "quiz").length,
      completionSignals: items.filter((item) => item.status === "completed").length,
      materialized,
      needsConfirmation,
      dismissed
    };
  }
}
