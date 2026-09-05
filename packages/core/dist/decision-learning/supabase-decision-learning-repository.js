import { zonedDateTimeToUtc } from "@amber/shared";
const addDays = (date, days) => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};
const json = (value) => value;
export class SupabaseDecisionLearningRepository {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async recordMaterialDecision(input, userReason) {
        return this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.idempotencyKey}`},0))`;
            const existing = await tx `
        select id,status from public.decisions where user_id=${input.userId}
          and impact->>'idempotencyKey'=${input.idempotencyKey} limit 1
      `;
            if (existing[0]) {
                const feedback = await tx `
          select id from public.decision_feedback where user_id=${input.userId} and decision_id=${existing[0].id}
        `;
                return {
                    decisionId: existing[0].id,
                    feedbackId: feedback[0].id,
                    created: false,
                    needsReason: existing[0].status === "awaiting_reason"
                };
            }
            const decisions = await tx `
        insert into public.decisions(
          user_id,workflow_run_id,question,why_now,options,ai_recommendation,impact,status,created_at,resolved_at
        ) values(
          ${input.userId},${input.workflowRunId},'Amber의 중요한 제안을 어떻게 적용할까?',
          ${input.decisionType},${tx.json({ choices: ["amber_recommendation", "user_choice"] })},
          ${tx.json(json(input.amberRecommendation))},${tx.json(json({
                decisionType: input.decisionType,
                idempotencyKey: input.idempotencyKey,
                context: input.situation
            }))},${userReason ? "resolved" : "awaiting_reason"},${input.occurredAt},${userReason ? input.occurredAt : null}
        ) returning id,status
      `;
            const decision = decisions[0];
            const feedback = await tx `
        insert into public.decision_feedback(user_id,decision_id,user_choice,user_reason)
        values(${input.userId},${decision.id},${tx.json(json({
                ...input.userChoice,
                reasonProvenance: userReason ? "user_explicit" : "not_provided"
            }))},${userReason}) returning id
      `;
            await tx `
        insert into public.domain_events(
          user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload
        ) select ${input.userId},'decision_resolved','decision',${decision.id},'user',${input.occurredAt},w.correlation_id,w.id,
          ${`decision-learning:${input.idempotencyKey}`},1,${tx.json({ decision_type: input.decisionType, reason_known: userReason !== null })}
          from public.workflow_runs w where w.id=${input.workflowRunId} and w.user_id=${input.userId}
        on conflict(user_id,idempotency_key) do nothing
      `;
            return {
                decisionId: decision.id,
                feedbackId: feedback[0].id,
                created: true,
                needsReason: userReason === null
            };
        });
    }
    async recordPendingReason(userId, reason, messageId, now) {
        return this.sql.begin(async (tx) => {
            const decisions = await tx `
        select id,status from public.decisions where user_id=${userId} and status='awaiting_reason'
        order by created_at desc limit 1 for update
      `;
            const decision = decisions[0];
            if (!decision)
                return false;
            const updated = await tx `
        update public.decision_feedback set user_reason=${reason},
          user_choice=user_choice || ${tx.json({ reasonProvenance: "user_explicit", reasonMessageId: messageId })}
        where user_id=${userId} and decision_id=${decision.id} and user_reason is null returning id
      `;
            if (!updated[0])
                return false;
            await tx `update public.decisions set status='resolved',resolved_at=${now} where id=${decision.id} and user_id=${userId}`;
            return true;
        });
    }
    async createLearningCasesForDay(input) {
        const start = zonedDateTimeToUtc(`${input.date}T00:00:00`, input.timeZone);
        const end = zonedDateTimeToUtc(`${addDays(input.date, 1)}T00:00:00`, input.timeZone);
        return this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${input.userId}:learning:${input.date}`},0))`;
            const decisions = await tx `
        select d.id,f.id feedback_id,f.user_choice,f.user_reason,d.ai_recommendation,d.impact
        from public.decisions d join public.decision_feedback f on f.decision_id=d.id and f.user_id=d.user_id
        where d.user_id=${input.userId} and d.impact->'context'->>'planDate'=${input.date}
          and not exists(select 1 from public.learning_cases l where l.user_id=d.user_id and l.decision_id=d.id)
        order by d.created_at
      `;
            let created = 0;
            for (const decision of decisions) {
                const evidence = await tx `
          select id,event_type,aggregate_type,aggregate_id from public.domain_events
          where user_id=${input.userId} and occurred_at>=${start} and occurred_at<${end}
            and event_type in ('day_closed','task_completed','task_blocked','task_switched','focus_completed','focus_blocked')
          order by occurred_at
        `;
                if (evidence.length === 0)
                    continue;
                const impact = decision.impact && typeof decision.impact === "object" ? decision.impact : {};
                const cases = await tx `
          insert into public.learning_cases(
            user_id,case_type,context_snapshot,recommendation_snapshot,decision_id,decision_feedback_id,status,closed_at
          ) values(${input.userId},'decision',${tx.json(json({
                    situation: impact.context ?? {},
                    userChoice: decision.user_choice,
                    userReason: decision.user_reason,
                    observedOutcome: input.dayCloseResult,
                    evidenceRefs: evidence.map((event) => ({
                        domainEventId: event.id,
                        eventType: event.event_type,
                        aggregateType: event.aggregate_type,
                        aggregateId: event.aggregate_id
                    }))
                }))},${tx.json((decision.ai_recommendation ?? {}))},${decision.id},${decision.feedback_id},'closed',${input.observedAt})
          returning id
        `;
                const learningCaseId = cases[0].id;
                for (const event of evidence) {
                    await tx `
            insert into public.learning_case_events(learning_case_id,domain_event_id,event_role)
            values(${learningCaseId},${event.id},'outcome') on conflict do nothing
          `;
                }
                const dayClosed = evidence.find((event) => event.event_type === "day_closed") ?? evidence[0];
                await tx `
          insert into public.outcomes(user_id,learning_case_id,source_event_id,outcome_type,summary,payload,observed_at)
          values(${input.userId},${learningCaseId},${dayClosed.id},'day_close_observation','Day Close에서 실제 실행 결과를 관찰함',
            ${tx.json(input.dayCloseResult)},${input.observedAt})
        `;
                created += 1;
            }
            return created;
        });
    }
}
//# sourceMappingURL=supabase-decision-learning-repository.js.map