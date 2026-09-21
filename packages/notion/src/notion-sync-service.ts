import type { NotionIntegrationAccount, NotionWorkSourceClient, WorkItemProcessor } from "./contracts.js";
import type { SupabaseNotionRepository } from "./supabase-notion-repository.js";

export interface NotionSyncResult {
  readonly received: number;
  readonly materialized: number;
  readonly needsConfirmation: number;
  readonly dismissed: number;
  readonly skippedCompleted: number;
  readonly currentTermCourses: number;
  readonly matchedSnowboardCourses: number;
}

export class NotionSyncService {
  constructor(private readonly client: NotionWorkSourceClient, private readonly repository: SupabaseNotionRepository, private readonly processor: WorkItemProcessor) {}
  async sync(account: NotionIntegrationAccount, observedAt = new Date()): Promise<NotionSyncResult> {
    let received = 0, materialized = 0, needsConfirmation = 0, dismissed = 0, skippedCompleted = 0, currentTermCourses = 0, matchedSnowboardCourses = 0;
    for (const sourceId of account.sourceIds) {
      const items = await this.client.listWorkItems(sourceId, observedAt);
      received += items.length;
      for (const item of items) {
        if (item.status === "completed" && !await this.repository.hasTaskReference(account.userId, item.sourceItemId)) {
          if (await this.repository.dismissPendingChecklistItem(account.userId, item.sourceItemId)) dismissed += 1;
          skippedCompleted += 1;
          continue;
        }
        const result = await this.processor.processDiscoveredWorkItem(account.userId, item);
        if (result.status === "materialized") materialized += 1;
        else if (result.status === "needs_confirmation") needsConfirmation += 1;
        else if (result.status === "dismissed") dismissed += 1;
      }
      const courses = await this.client.listUniversityCourses?.(sourceId, "2026-2", observedAt) ?? [];
      currentTermCourses += courses.length;
      for (const course of courses) {
        const connection = await this.repository.connectUniversityCourse(account.userId, course, "2026-2");
        if (connection.matchedSnowboard) matchedSnowboardCourses += 1;
      }
    }
    await this.repository.markSynced(account.id, account.userId, observedAt);
    return { received, materialized, needsConfirmation, dismissed, skippedCompleted, currentTermCourses, matchedSnowboardCourses };
  }
}
