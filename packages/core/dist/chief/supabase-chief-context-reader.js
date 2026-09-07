import { zonedDateTimeToUtc } from "@amber/shared";
import { SupabaseAgentRunRecorder } from "../agent-execution/supabase-agent-run-recorder.js";
import { deriveCurrentAction } from "../execution/current-action.js";
const addDays = (date, count) => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + count);
    return value.toISOString().slice(0, 10);
};
export class SupabaseChiefContextReader {
    sql;
    observationReader;
    constructor(sql, observationReader) {
        this.sql = sql;
        this.observationReader = observationReader;
    }
    async loadChiefContext(userId, planDate, timeZone, now) {
        const start = zonedDateTimeToUtc(`${planDate}T00:00:00`, timeZone);
        const end = zonedDateTimeToUtc(`${addDays(planDate, 1)}T00:00:00`, timeZone);
        const [observation, plans, action, focus, replans, settings] = await Promise.all([
            this.observationReader.loadObservation(userId, planDate, timeZone, now),
            this.sql `
        select id,revision_no from public.daily_plans
        where user_id=${userId} and plan_date=${planDate} and status='approved'
        order by revision_no desc limit 1
      `,
            deriveCurrentAction(this.sql, userId, planDate),
            this.sql `
        select f.id,f.task_id,t.title,f.started_at from public.focus_sessions f
        join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
        where f.user_id=${userId} and f.status='active' order by f.started_at desc limit 1
      `,
            this.sql `
        select exists(select 1 from public.domain_events where user_id=${userId} and event_type='plan_replanned'
          and occurred_at>=${start} and occurred_at<${end}) present
      `,
            this.sql `select week_starts_on from public.user_settings where user_id=${userId}`
        ]);
        return {
            userId,
            observedAt: now,
            planDate,
            timeZone,
            observation,
            approvedPlan: plans[0] ? { id: plans[0].id, revisionNo: plans[0].revision_no } : null,
            currentAction: action,
            activeFocus: focus[0] ? { id: focus[0].id, taskId: focus[0].task_id, title: focus[0].title, startedAt: focus[0].started_at } : null,
            replannedToday: replans[0]?.present ?? false,
            weekStartsOn: settings[0]?.week_starts_on ?? 1
        };
    }
}
export class SupabaseChiefRunRecorder {
    recorder;
    constructor(sql) {
        this.recorder = new SupabaseAgentRunRecorder(sql);
    }
    async findCompleted(userId, triggerId) {
        const reply = await this.recorder.findCompleted(userId, "chief", "chief_response", triggerId);
        return reply ? { reply } : null;
    }
    async recordCompleted(input) {
        const contextPayload = {
            planDate: input.context.planDate,
            approvedPlanId: input.context.approvedPlan?.id ?? null,
            currentAction: input.context.currentAction,
            activeFocusId: input.context.activeFocus?.id ?? null,
            fixedConstraintIds: input.context.observation.constraints.filter((item) => item.blocksCapacity).map((item) => item.id),
            taskIds: input.context.observation.tasks.map((task) => task.id),
            blockedTaskIds: input.context.observation.tasks.filter((task) => task.status === "BLOCKED").map((task) => task.id),
            recurringActivityIds: input.context.observation.recurringActivities.map((activity) => activity.id),
            carryoverTaskIds: input.context.observation.carryoverContext?.taskIds ?? [],
            availablePrincipleIds: input.context.observation.principles?.map((principle) => principle.id) ?? [],
            usedPrincipleIds: input.usedPrincipleIds,
            replannedToday: input.context.replannedToday
        };
        await this.recorder.recordCompleted({
            userId: input.context.userId,
            agentTemplateKey: "chief",
            artifactType: "chief_response",
            triggerId: input.triggerId,
            source: input.source,
            requestKind: input.requestKind,
            contextPayload,
            reply: input.reply,
            policyVersion: "chief-v0.1",
            startedAt: input.startedAt,
            completedAt: input.completedAt,
            workstyleProfileRevisions: input.workstyle?.profileRevisions ?? []
        });
    }
    async recordDelegationCompleted(input) {
        await this.recorder.recordCompleted({
            userId: input.userId,
            agentTemplateKey: "chief",
            artifactType: "chief_response",
            triggerId: input.triggerId,
            source: input.source,
            requestKind: "project_delegation",
            contextPayload: {
                delegatedAgent: "project_pm",
                projectId: input.report.project.id,
                status: input.report.status,
                nextTaskId: input.report.nextAction?.taskId ?? null,
                blockerCount: input.report.blockers.length,
                nearestDeadlineTaskId: input.report.nearestDeadline?.taskId ?? null
            },
            reply: input.reply,
            policyVersion: "chief-v0.1",
            startedAt: input.startedAt,
            completedAt: input.completedAt,
            workstyleProfileRevisions: input.workstyle?.profileRevisions ?? [],
            correlationId: input.correlationId
        });
    }
}
//# sourceMappingURL=supabase-chief-context-reader.js.map