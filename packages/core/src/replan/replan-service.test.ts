import { FixedClock, type TaskId, type UserId } from "@amber/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MorningObservation, MorningPlan } from "../morning/morning.js";
import type { Task } from "../task/task.js";
import { DynamicReplanningService } from "./replan-service.js";
import type { ReplanPlanState, ReplanRepository, ReplanRevisionResult, ReplanTrigger } from "./replan.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const now = new Date("2026-09-04T03:00:00.000Z");
const task: Task = {
  id: "20000000-0000-4000-8000-000000000001" as TaskId, userId, workContextId: null, objectiveId: null,
  title: "과제", description: null, executionMode: "standard", officialDeadline: null, internalDeadline: null,
  estimatedMinutes: 60, estimatedUserMinutes: null, actualMinutes: 10, importance: 3, status: "IN_PROGRESS",
  nextAction: null, completionCriteria: null, completionSource: null, createdAt: now, completedAt: null, updatedAt: now
};
const observation: MorningObservation = {
  timeZone: "Asia/Seoul", planningBufferMinutes: 10, planningPolicy: {}, constraints: [], tasks: [task],
  recurringActivities: [], strategicDirectives: []
};
const state: ReplanPlanState = {
  planId: "30000000-0000-4000-8000-000000000001", revisionNo: 1, planDate: "2026-09-04", timeZone: "Asia/Seoul",
  workUntil: new Date("2026-09-04T06:00:00.000Z"), privateIntervals: [], activeTaskId: task.id,
  items: [{
    id: "item", itemType: "task", taskId: task.id, title: task.title, plannedMinutes: 50, start: now,
    end: new Date("2026-09-04T03:50:00.000Z"), status: "in_progress", taskStatus: "IN_PROGRESS",
    taskImportance: 3, taskDeadline: null
  }]
};
const plan: MorningPlan = {
  id: "40000000-0000-4000-8000-000000000001", revisionNo: 2, status: "approved", fixedEvents: [], highlights: [],
  items: [{ itemType: "task", taskId: task.id, title: task.title, plannedMinutes: 50, start: now, end: new Date("2026-09-04T03:50:00.000Z") }]
};

const trigger = (reason: ReplanTrigger["reason"], deltaMinutes: number): ReplanTrigger => ({
  id: `trigger-${reason}`, userId, reason, deltaMinutes, correlationId: "50000000-0000-4000-8000-000000000001", occurredAt: now
});

describe("DynamicReplanningService", () => {
  let repository: ReplanRepository;
  let result: ReplanRevisionResult;
  const approve = vi.fn();

  beforeEach(() => {
    result = {
      workflow: {
        id: "workflow", userId, status: "completed", currentStep: "completed", checkpointVersion: 1,
        correlationId: "50000000-0000-4000-8000-000000000001", planDate: state.planDate, timeZone: state.timeZone,
        planId: plan.id, triggerId: "trigger", impact: "SMALL_CHANGE"
      },
      plan,
      duplicate: false
    };
    repository = {
      findLatestPendingTrigger: vi.fn(),
      createManualTrigger: vi.fn(),
      findPendingApproval: vi.fn(),
      findCompletedApprovalByMessage: vi.fn(),
      findByTrigger: vi.fn().mockResolvedValue(null),
      loadPlanState: vi.fn().mockResolvedValue(state),
      createRevision: vi.fn().mockResolvedValue(result),
      deriveCurrentAction: vi.fn().mockResolvedValue(null)
    };
    approve.mockReset().mockResolvedValue({ plan, duplicate: false });
  });

  const service = () => new DynamicReplanningService({
    repository,
    observationReader: { loadObservation: vi.fn().mockResolvedValue(observation), approve },
    clock: new FixedClock(now)
  });

  it.each<[ReplanTrigger["reason"], number]>([
    ["task_overrun", 20], ["task_completed_early", -20], ["task_blocked", 0], ["task_switched", 0], ["manual_replan", 0]
  ])("creates a revision for %s", async (reason, delta) => {
    vi.mocked(repository.findLatestPendingTrigger).mockResolvedValue(trigger(reason, delta));
    const reply = await service().processLatestTrigger(userId, "Asia/Seoul", now);
    expect(reply).toContain("일정 조금 조정했어");
    expect(repository.createRevision).toHaveBeenCalledOnce();
  });

  it("does not create another revision for the same trigger", async () => {
    vi.mocked(repository.findLatestPendingTrigger).mockResolvedValue(trigger("task_overrun", 20));
    vi.mocked(repository.findByTrigger).mockResolvedValue({ ...result, duplicate: true });
    expect(await service().processLatestTrigger(userId, "Asia/Seoul", now)).toContain("이미 일정을 조정했어");
    expect(repository.createRevision).not.toHaveBeenCalled();
  });

  it("routes manual replan without sending it to task input", async () => {
    vi.mocked(repository.createManualTrigger).mockResolvedValue(trigger("manual_replan", 0));
    const response = await service().handleReplanMessage({
      userId, timeZone: "Asia/Seoul", text: "오늘 일정 다시 짜줘", messageId: "discord:manual", receivedAt: now
    });
    expect(response.handled).toBe(true);
    expect(repository.createManualTrigger).toHaveBeenCalledWith(userId, now, "discord:manual");
  });

  it("requires approval for an important revision and resumes it safely", async () => {
    const workflow = { ...result.workflow, status: "waiting_for_user" as const, currentStep: "awaiting_approval" as const, impact: "IMPORTANT_CHANGE" as const };
    vi.mocked(repository.findPendingApproval).mockResolvedValue(workflow);
    const response = await service().handleReplanMessage({
      userId, timeZone: "Asia/Seoul", text: "승인", messageId: "discord:approve", receivedAt: now
    });
    expect(response.reply).toContain("새 계획을 승인했어");
    expect(approve).toHaveBeenCalledOnce();
  });
});
