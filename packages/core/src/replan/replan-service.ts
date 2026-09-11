import { createHash } from "node:crypto";
import { DomainError, type UserId } from "@amber/shared";
import type { MorningObservation, MorningPlan, MorningWorkflowRun } from "../morning/morning.js";
import { shouldReplanForTrigger } from "../rules/replan.js";
import { classifyReplanImpact } from "./replan-impact.js";
import { buildReplanDraft, resolveReplanWorkUntil } from "./replan-planner.js";
import { interpretChiefReplanRequest } from "./chief-replan-request.js";
import type {
  ReplanMessage,
  ReplanMessageHandler,
  ReplanMessageResult,
  ReplanPlanState,
  ReplanServiceDependencies,
  ReplanTrigger,
  ReplanWorkflowRun
} from "./replan.js";

const localDate = (value: Date, timeZone: string): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const localWeekday = (value: Date, timeZone: string): number => {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as const)[label as "Mon"] ?? 1;
};

const timeLabel = (value: Date, timeZone: string): string => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(value);

const formatPlan = (plan: MorningPlan, timeZone: string): string => plan.items.length === 0
  ? "배치할 수 있는 남은 일이 없어."
  : plan.items.map((item) => `${timeLabel(item.start, timeZone)}–${timeLabel(item.end, timeZone)} ${item.title}`).join("\n");

const reasonText = (reason: ReplanTrigger["reason"]): string => ({
  task_overrun: "현재 작업이 예상보다 길어져서",
  task_completed_early: "현재 작업이 예상보다 일찍 끝나서",
  task_blocked: "현재 작업이 막혀서",
  task_switched: "작업을 전환해서",
  manual_replan: "요청한 현재 상황을 반영해서"
})[reason];

const stateHash = (trigger: ReplanTrigger, state: ReplanPlanState, observation: MorningObservation): string => createHash("sha256")
  .update(JSON.stringify({
    reason: trigger.reason,
    tasks: observation.tasks.map((task) => [task.id, task.status, task.actualMinutes, task.updatedAt.toISOString()]),
    constraints: observation.constraints.map((value) => [value.id, value.start.toISOString(), value.end.toISOString(), value.blocksCapacity]),
    routines: observation.recurringActivities.map((value) => [value.id, value.completedCount]),
    directives: observation.strategicDirectives.map((value) => value.id),
    activeTaskId: state.activeTaskId,
    workUntil: state.workUntil.toISOString(),
    adjustment: trigger.adjustment ?? null,
    manualTriggerId: trigger.reason === "manual_replan" ? trigger.id : null
  }))
  .digest("hex");

const asMorningWorkflow = (workflow: ReplanWorkflowRun): MorningWorkflowRun => ({
  id: workflow.id,
  userId: workflow.userId,
  status: workflow.status === "completed" ? "completed" : "waiting_for_user",
  currentStep: workflow.currentStep,
  checkpoint: {
    planDate: workflow.planDate,
    timeZone: workflow.timeZone,
    planId: workflow.planId,
    triggerId: workflow.triggerId,
    impact: workflow.impact
  },
  checkpointVersion: workflow.checkpointVersion,
  correlationId: workflow.correlationId
});

export class DynamicReplanningService implements ReplanMessageHandler {
  private readonly repository: ReplanServiceDependencies["repository"];
  private readonly observationReader: ReplanServiceDependencies["observationReader"];
  private readonly clock: ReplanServiceDependencies["clock"];
  private readonly decisionLearning: ReplanServiceDependencies["decisionLearning"];

  constructor(dependencies: ReplanServiceDependencies) {
    this.repository = dependencies.repository;
    this.observationReader = dependencies.observationReader;
    this.clock = dependencies.clock;
    this.decisionLearning = dependencies.decisionLearning;
  }

  async processLatestTrigger(userId: UserId, timeZone: string, receivedAt: Date): Promise<string | null> {
    const trigger = await this.repository.findLatestPendingTrigger(userId);
    return trigger ? this.processTrigger(trigger, timeZone, receivedAt) : null;
  }

  async handleReplanMessage(message: ReplanMessage): Promise<ReplanMessageResult> {
    const text = message.text.trim();
    const planDate = localDate(message.receivedAt, message.timeZone);
    if (text.startsWith("승인")) {
      const workflow = await this.repository.findPendingApproval(message.userId, planDate);
      if (!workflow) {
        const completed = await this.repository.findCompletedApprovalByMessage(message.userId, planDate, message.messageId);
        return completed ? { handled: true, reply: "이미 새 계획을 승인했어." } : { handled: false };
      }
      const result = await this.observationReader.approve(asMorningWorkflow(workflow), this.clock.now(), message.messageId);
      const action = await this.repository.deriveCurrentAction(message.userId, planDate);
      const baseReply = result.duplicate
        ? "이미 새 계획을 승인했어."
        : action ? `새 계획을 승인했어. 다음 할 일은 ${action.title}이야.` : "새 계획을 승인했어. 지금 시작할 계획 항목은 없어.";
      const followUp = workflow.impact === "IMPORTANT_CHANGE"
        ? await this.recordImportantDecision(message, workflow, "approve") : null;
      return {
        handled: true,
        reply: followUp ? `${baseReply}\n\n${followUp}` : baseReply
      };
    }
    if (text === "거절" || text.startsWith("거절,") || text.startsWith("기존 계획 유지")) {
      const workflow = await this.repository.findPendingApproval(message.userId, planDate);
      if (!workflow) return { handled: false };
      const rejected = await this.repository.reject(workflow, this.clock.now(), message.messageId);
      const baseReply = rejected.duplicate ? "이미 이 변경을 거절했어." : "알겠어. 기존 계획을 유지할게.";
      const followUp = workflow.impact === "IMPORTANT_CHANGE"
        ? await this.recordImportantDecision(message, workflow, "reject") : null;
      return { handled: true, reply: followUp ? `${baseReply}\n\n${followUp}` : baseReply };
    }
    const adjustment = interpretChiefReplanRequest(text);
    if (!adjustment) return { handled: false };
    const pending = await this.repository.findPendingApproval(message.userId, planDate);
    if (pending) {
      const existing = await this.repository.findByTrigger(message.userId, pending.triggerId);
      if (existing) return {
        handled: true,
        reply: `승인할 새 계획이 이미 있어.\n\n${formatPlan(existing.plan, pending.timeZone)}\n\n“승인”이라고 보내면 반영할게.`
      };
    }
    if (!await this.repository.loadPlanState(message.userId, planDate)) {
      return { handled: true, reply: "승인된 오늘 계획이 없어. 먼저 오늘 계획을 만들어줘." };
    }
    const trigger = await this.repository.createManualTrigger(message.userId, this.clock.now(), message.messageId, adjustment);
    const reply = await this.processTrigger(trigger, message.timeZone, message.receivedAt);
    return { handled: true, reply: reply ?? "승인된 오늘 계획이 없어. 먼저 오늘 계획을 만들어줘." };
  }

  private async recordImportantDecision(
    message: ReplanMessage,
    workflow: ReplanWorkflowRun,
    choice: "approve" | "reject"
  ): Promise<string | null> {
    if (!this.decisionLearning) return null;
    const revision = await this.repository.findByTrigger(message.userId, workflow.triggerId);
    return this.decisionLearning.recordMaterialDecision({
      userId: message.userId,
      workflowRunId: workflow.id,
      idempotencyKey: `important-replan:${workflow.id}:${choice}`,
      decisionType: "important_replan",
      situation: {
        planDate: workflow.planDate,
        planId: workflow.planId,
        triggerId: workflow.triggerId,
        impactReasons: workflow.impactReasons ?? []
      },
      amberRecommendation: {
        action: "apply_replanned_schedule",
        planId: workflow.planId,
        itemIds: revision?.plan.items.map((item) => item.taskId ?? item.recurringActivityId ?? item.title) ?? []
      },
      userChoice: { action: choice },
      userMessage: message.text,
      occurredAt: this.clock.now()
    });
  }

  private async processTrigger(trigger: ReplanTrigger, timeZone: string, receivedAt: Date): Promise<string | null> {
    const prior = await this.repository.findByTrigger(trigger.userId, trigger.id);
    if (prior) return prior.workflow.impact === "SMALL_CHANGE"
      ? `이미 일정을 조정했어.\n\n${formatPlan(prior.plan, prior.workflow.timeZone)}`
      : `새 계획을 이미 제안했어.\n\n${formatPlan(prior.plan, prior.workflow.timeZone)}\n\n“승인”이라고 보내면 반영할게.`;
    if (!shouldReplanForTrigger(trigger.reason, trigger.deltaMinutes)) return null;
    const planDate = localDate(receivedAt, timeZone);
    const previous = await this.repository.loadPlanState(trigger.userId, planDate);
    if (!previous) return null;
    const now = this.clock.now();
    const observation = await this.observationReader.loadObservation(trigger.userId, planDate, timeZone, now);
    const prioritizedTask = trigger.adjustment?.kind === "prioritize_task" ? trigger.adjustment : null;
    if (prioritizedTask && !observation.tasks.some((task) =>
      task.title.toLocaleLowerCase().includes(prioritizedTask.taskQuery.toLocaleLowerCase())
    )) {
      throw new DomainError("INVALID_INPUT", `우선 배치할 작업을 찾지 못했습니다: ${prioritizedTask.taskQuery}`);
    }
    const current = { ...previous, workUntil: resolveReplanWorkUntil(observation, previous) };
    const draft = buildReplanDraft({
      observation, previous: current, now,
      ...(trigger.adjustment ? { adjustment: trigger.adjustment } : {})
    });
    const classified = classifyReplanImpact(current, draft, observation, localWeekday(now, timeZone));
    const decision = trigger.adjustment && trigger.adjustment.kind !== "rebalance"
      ? { impact: "IMPORTANT_CHANGE" as const, reasons: [...new Set([`user_${trigger.adjustment.kind}`, ...classified.reasons])] }
      : classified;
    const result = await this.repository.createRevision(trigger, stateHash(trigger, current, observation), current, draft, decision, now);
    if (result.workflow.impact === "SMALL_CHANGE") {
      const action = await this.repository.deriveCurrentAction(trigger.userId, previous.planDate);
      const next = action ? `\n\n다음 할 일은 ${action.title}이야.` : "";
      return `일정 조금 조정했어. ${reasonText(trigger.reason)} 남은 순서를 다시 맞췄어. 휴식과 버퍼는 보호했어.\n\n${formatPlan(result.plan, timeZone)}${next}`;
    }
    return `중요한 일정 변경이 필요해. 현재 상태 기준 새 계획이야.\n\n${formatPlan(result.plan, timeZone)}\n\n“승인”이라고 보내면 반영할게.`;
  }
}
