import type { TaskStatus } from "../task/task.js";
import type { WorldModelSnapshot } from "../world-model/world-model.js";
import type { ActionCandidate, ActionCandidateStatus } from "./action-candidate.js";

const executableStatuses: readonly ActionCandidateStatus[] = ["INBOX", "PLANNED", "IN_PROGRESS"];

const isExecutable = (status: TaskStatus): status is ActionCandidateStatus =>
  (executableStatuses as readonly TaskStatus[]).includes(status);

/** Pure projection only: preserves World Model Task order and makes no ranking decision. */
export const buildActionCandidates = (snapshot: WorldModelSnapshot): readonly ActionCandidate[] =>
  snapshot.tasks.flatMap((task) => {
    if (!isExecutable(task.status)) return [];
    const context = task.contextId === null
      ? undefined
      : task.contextType === "project"
        ? snapshot.contexts.projects.find((item) => item.id === task.contextId)
        : snapshot.contexts.learning.find((item) => item.id === task.contextId && item.type === task.contextType);
    return [{
      taskId: task.id,
      title: task.title,
      taskType: task.taskType,
      contextId: task.contextId,
      contextType: task.contextType,
      contextTitle: task.contextTitle,
      status: task.status,
      importance: task.importance,
      deadline: task.deadline,
      deadlineSource: task.deadlineSource,
      estimatedMinutes: task.estimatedMinutes,
      remainingMinutes: task.remainingMinutes,
      plannedDate: task.plannedDate,
      completionCriteria: task.completionCriteria,
      contextEvidence: {
        commitmentLevel: context?.commitmentLevel ?? null,
        strategicImportance: context?.strategicImportance ?? null
      },
      feasibility: {
        canFitToday: task.remainingMinutes === null
          ? null
          : task.remainingMinutes <= snapshot.constraints.todayCapacity.availableMinutes
      },
      evidence: {
        overdue: task.deadline !== null && task.deadline < snapshot.now,
        worldRiskTypes: snapshot.risks
          .filter((risk) => risk.taskIds.includes(task.id))
          .map((risk) => risk.type)
      }
    }];
  });
