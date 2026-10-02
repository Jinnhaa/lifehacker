import "server-only";

import { SupabaseLearningTaskExecutionRepository } from "@amber/core";
import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { loadLearningWorkspace } from "./learning-workspace-server";

export interface LearningTaskReconciliationResult {
  readonly createdTaskIds: readonly string[];
  readonly existingTaskIds: readonly string[];
  readonly reusedOverlapTaskIds: readonly string[];
  readonly skippedProposalCount: number;
}

/** Explicit write boundary: concrete Learning proposals become canonical Tasks before reality is read. */
export async function reconcileLearningTasksForToday(input: {
  readonly sql: Sql;
  readonly userId: UserId;
  readonly today: string;
  readonly occurredAt?: Date;
}): Promise<LearningTaskReconciliationResult> {
  const workspace = await loadLearningWorkspace({ sql: input.sql, userId: input.userId, today: input.today });
  if (!workspace.configured) throw new Error(workspace.error ?? "Learning workspace를 불러오지 못했습니다.");
  const actions = [...workspace.courses, ...workspace.certifications].flatMap((context) => context.actions);
  const existingTaskIds = actions.flatMap((action) => action.kind === "task" && action.taskId ? [action.taskId] : []);
  const repository = new SupabaseLearningTaskExecutionRepository(input.sql);
  const createdTaskIds: string[] = [];
  const reusedOverlapTaskIds: string[] = [];
  const seenMaterials = new Set<string>();
  let skippedProposalCount = 0;

  for (const action of actions) {
    if (action.kind !== "proposal" || !action.proposal) continue;
    if (seenMaterials.has(action.materialId)) {
      skippedProposalCount += 1;
      continue;
    }
    seenMaterials.add(action.materialId);
    const result = await repository.materialize(input.userId, action.proposal, input.occurredAt);
    if (result.kind === "created") createdTaskIds.push(result.taskId);
    else if (result.kind === "existing") existingTaskIds.push(result.taskId);
    else reusedOverlapTaskIds.push(result.taskId);
  }

  return {
    createdTaskIds,
    existingTaskIds: [...new Set(existingTaskIds)],
    reusedOverlapTaskIds: [...new Set(reusedOverlapTaskIds)],
    skippedProposalCount
  };
}
