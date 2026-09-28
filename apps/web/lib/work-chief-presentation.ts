import type { OutcomeJudgment } from "@amber/core";
import type { WorkTaskItem, WorkTodayQuest } from "./work-types";

type Choice = OutcomeJudgment["todayPriority"][number];

export function canonicalWorkTodayChoices(judgment: OutcomeJudgment): readonly Choice[] {
  const selected = [
    ...judgment.todayPriority,
    ...(judgment.futureRelief ? [judgment.futureRelief] : [])
  ].filter((choice) => judgment.eligibleTaskIds.includes(choice.taskId));
  const missionId = judgment.currentMission?.taskId;
  if (!missionId) return selected;
  const missionIndex = selected.findIndex((choice) => choice.taskId === missionId);
  if (missionIndex <= 0) return selected;
  return [selected[missionIndex]!, ...selected.slice(0, missionIndex), ...selected.slice(missionIndex + 1)];
}

export function mapCanonicalWorkTodayQuests(
  judgment: OutcomeJudgment,
  tasks: readonly WorkTaskItem[]
): readonly WorkTodayQuest[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return canonicalWorkTodayChoices(judgment).flatMap((choice) => {
    const task = taskById.get(choice.taskId);
    return task ? [{
      id: task.id,
      kind: "task" as const,
      task,
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
      contextTitle: task.contextTitle,
      priorityBand: task.priorityBand
    }] : [];
  });
}
