import { randomUUID } from "node:crypto";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DecisionLearningService, DECISION_REASON_QUESTION } from "./decision-learning-service.js";
import { SupabaseDecisionLearningRepository } from "./supabase-decision-learning-repository.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userId = randomUUID() as UserId;
const otherUserId = randomUUID() as UserId;
const workflowId = randomUUID();
const otherWorkflowId = randomUUID();
const correlationId = randomUUID();
const planId = randomUUID();
const now = new Date("2026-09-04T12:00:00.000Z");
const repository = new SupabaseDecisionLearningRepository(sql);
const service = new DecisionLearningService({ repository, clock: new FixedClock(now) });

beforeAll(async () => {
  await sql`
    insert into auth.users(id,email,created_at,updated_at) values
      (${userId},${`learning-${userId}@example.test`},now(),now()),
      (${otherUserId},${`learning-${otherUserId}@example.test`},now(),now())
  `;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${otherUserId},'Asia/Seoul')`;
  await sql`
    insert into public.workflow_runs(id,user_id,workflow_type,status,current_step,checkpoint_version,idempotency_key,correlation_id,started_at)
    values
      (${workflowId},${userId},'dynamic_replanning','completed','completed',1,'learning-workflow',${correlationId},${now}),
      (${otherWorkflowId},${otherUserId},'dynamic_replanning','completed','completed',1,'learning-workflow-other',gen_random_uuid(),${now})
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userId},${otherUserId})`;
  await sql.end();
});

const material = (message: string) => ({
  userId,
  workflowRunId: workflowId,
  idempotencyKey: "important-replan:one:reject",
  decisionType: "important_replan" as const,
  situation: { planDate: "2026-09-04", planId, impactReasons: ["deadline_risk_increased"] },
  amberRecommendation: { action: "apply_replanned_schedule", planId },
  userChoice: { action: "reject" },
  userMessage: message,
  occurredAt: now
});

describe("Supabase Decision Learning", () => {
  it("stores one material Decision/Feedback and asks for a missing reason once", async () => {
    expect(await service.recordMaterialDecision(material("거절"))).toBe(DECISION_REASON_QUESTION);
    expect(await service.recordMaterialDecision(material("거절"))).toBeNull();
    const rows = await sql<{ decisions: number; feedback: number; cases: number; reason: string | null; provenance: string }[]>`
      select
        (select count(*)::int from public.decisions where user_id=${userId}) decisions,
        (select count(*)::int from public.decision_feedback where user_id=${userId}) feedback,
        (select count(*)::int from public.learning_cases where user_id=${userId}) cases,
        f.user_reason reason,f.user_choice->>'reasonProvenance' provenance
      from public.decision_feedback f where f.user_id=${userId}
    `;
    expect(rows[0]).toEqual({ decisions: 1, feedback: 1, cases: 0, reason: null, provenance: "not_provided" });
  });

  it("does not create a LearningCase before actual evidence exists", async () => {
    await expect(service.collectDayCloseOutcomes({
      userId, date: "2026-09-04", timeZone: "Asia/Seoul", dayCloseResult: { plannedMinutes: 60, actualMinutes: 0 }, observedAt: now
    })).resolves.toBe(0);
  });

  it("stores explicit reason provenance and creates one evidenced LearningCase at Day Close", async () => {
    await service.handleReasonMessage({ userId, text: "이유는 오늘 마감 과제가 더 중요해서", messageId: "discord:reason", receivedAt: now });
    const dayClosedEvent = randomUUID();
    await sql`
      insert into public.domain_events(id,user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,workflow_run_id,idempotency_key,payload_version,payload)
      values(${dayClosedEvent},${userId},'day_closed','daily_plan',${planId},'user',${now},${correlationId},${workflowId},'day-close-learning',1,
        ${sql.json({ plannedMinutes: 60, actualMinutes: 45 })})
    `;
    const outcome = {
      userId, date: "2026-09-04", timeZone: "Asia/Seoul",
      dayCloseResult: { plannedMinutes: 60, actualMinutes: 45, completedTaskIds: [], blockedTaskIds: [] }, observedAt: now
    };
    expect(await service.collectDayCloseOutcomes(outcome)).toBe(1);
    expect(await service.collectDayCloseOutcomes(outcome)).toBe(0);
    const rows = await sql<{
      cases: number; outcomes: number; linkedEvidence: number; evidence: unknown[]; reason: string; provenance: string;
      observed: { actualMinutes: number };
    }[]>`
      select
        (select count(*)::int from public.learning_cases where user_id=${userId}) cases,
        (select count(*)::int from public.outcomes where user_id=${userId}) outcomes,
        (select count(*)::int from public.learning_case_events e
          join public.learning_cases c on c.id=e.learning_case_id where c.user_id=${userId}) "linkedEvidence",
        l.context_snapshot->'evidenceRefs' evidence,
        f.user_reason reason,f.user_choice->>'reasonProvenance' provenance,l.context_snapshot->'observedOutcome' observed
      from public.learning_cases l join public.decision_feedback f on f.id=l.decision_feedback_id
      where l.user_id=${userId}
    `;
    expect(rows[0]).toEqual({
      cases: 1, outcomes: 1, linkedEvidence: 1,
      evidence: [{ domainEventId: dayClosedEvent, eventType: "day_closed", aggregateType: "daily_plan", aggregateId: planId }],
      reason: "오늘 마감 과제가 더 중요해서",
      provenance: "user_explicit", observed: { actualMinutes: 45, plannedMinutes: 60, completedTaskIds: [], blockedTaskIds: [] }
    });
  });

  it("keeps decisions and outcomes isolated by user", async () => {
    await repository.recordMaterialDecision({
      ...material("거절"),
      userId: otherUserId,
      workflowRunId: otherWorkflowId,
      idempotencyKey: "important-replan:other:reject"
    }, null);
    await service.collectDayCloseOutcomes({
      userId, date: "2026-09-04", timeZone: "Asia/Seoul", dayCloseResult: {}, observedAt: now
    });
    const rows = await sql<{ decisions: number; cases: number }[]>`
      select
        (select count(*)::int from public.decisions where user_id=${otherUserId}) decisions,
        (select count(*)::int from public.learning_cases where user_id=${otherUserId}) cases
    `;
    expect(rows[0]).toEqual({ decisions: 1, cases: 0 });
  });
});
