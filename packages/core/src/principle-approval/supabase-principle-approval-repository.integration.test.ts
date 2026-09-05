import { randomUUID } from "node:crypto";
import { FixedClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrincipleApprovalService } from "./principle-approval-service.js";
import { SupabasePrincipleApprovalRepository } from "./supabase-principle-approval-repository.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userId = randomUUID() as UserId;
const otherUserId = randomUUID() as UserId;
const now = new Date("2026-09-04T12:00:00.000Z");
const repository = new SupabasePrincipleApprovalRepository(sql);
const service = new PrincipleApprovalService({ repository, clock: new FixedClock(now) });

beforeAll(async () => {
  await sql`
    insert into auth.users(id,email,created_at,updated_at) values
      (${userId},${`principle-${userId}@example.test`},now(),now()),
      (${otherUserId},${`principle-${otherUserId}@example.test`},now(),now())
  `;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${otherUserId},'Asia/Seoul')`;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userId},${otherUserId})`;
  await sql.end();
});

const addPattern = async (owner: UserId, action: string, evidenceCount: number): Promise<string> => {
  const patternId = randomUUID();
  await sql`
    insert into public.patterns(
      id,user_id,pattern_type,condition,observed_behavior,confidence,evidence_count,evaluator_version,status,first_observed_at,last_observed_at
    ) values(${patternId},${owner},'decision_preference',${sql.json({
      signature: randomUUID(), decisionType: "important_replan", situationType: "deadline_risk_increased", choiceAction: action,
      consistencyKind: "reason", consistencyValue: "deadline_priority"
    })},'마감 위험이 있을 때 선택이 반복됨',0.85,${evidenceCount},'decision-pattern-v0.1','candidate',${now},${now})
  `;
  for (let index = 0; index < evidenceCount; index += 1) {
    const learningCaseId = randomUUID();
    await sql`
      insert into public.learning_cases(id,user_id,case_type,context_snapshot,status,closed_at)
      values(${learningCaseId},${owner},'decision','{}','closed',${now})
    `;
    await sql`
      insert into public.pattern_evidence(pattern_id,learning_case_id,direction,weight,observed_at)
      values(${patternId},${learningCaseId},'supports',1,${now})
    `;
  }
  return patternId;
};

const message = (text: string, messageId: string) => ({ userId, text, messageId, receivedAt: now });

describe("Supabase Principle Approval", () => {
  it("does not propose an under-evidenced Pattern and proposes an eligible one once", async () => {
    await addPattern(userId, "approve", 2);
    expect(await service.afterPatternEvaluation(userId)).toBeNull();
    await addPattern(userId, "reject", 3);
    const reply = await service.afterPatternEvaluation(userId);
    expect(reply).toContain("이런 선택이 3번 반복됐어");
    const pending = await sql<{ policy: string }[]>`
      select source_reference->>'applicationPolicy' policy from public.principles
      where user_id=${userId} and confirmation_status='pending'
    `;
    expect(pending[0]?.policy).toBe("deadline_over_routine");
    expect(await service.afterPatternEvaluation(userId)).toBeNull();
  });

  it("preserves an edit as a new pending revision, then approves it idempotently", async () => {
    const revised = await service.handlePrincipleApprovalMessage(message(
      "수정: 시험이나 발표가 24시간 이내일 때만", "discord:revise"
    ));
    expect(revised.reply).toContain("다시 확인");
    const beforeApproval = await sql<{ revisions: number; pending: number; explicit: number }[]>`
      select count(*)::int revisions,
        count(*) filter(where confirmation_status='pending')::int pending,
        count(*) filter(where origin='user_explicit')::int explicit
      from public.principles where user_id=${userId}
    `;
    expect(beforeApproval[0]).toEqual({ revisions: 2, pending: 1, explicit: 1 });

    const approved = await service.handlePrincipleApprovalMessage(message("승인", "discord:approve"));
    const retry = await service.handlePrincipleApprovalMessage(message("승인", "discord:approve"));
    expect(retry).toEqual(approved);
    const rows = await sql<{ approved: number; active: number; provenance: string }[]>`
      select
        count(*) filter(where confirmation_status='approved')::int approved,
        count(*) filter(where status='active')::int active,
        max(source_reference->>'approvalProvenance') filter(where confirmation_status='approved') provenance
      from public.principles where user_id=${userId}
    `;
    expect(rows[0]).toEqual({ approved: 1, active: 1, provenance: "user_explicit" });
  });

  it("rejects without deleting Pattern evidence and never asks for that Pattern again", async () => {
    const patternId = await addPattern(userId, "approve", 3);
    expect(await service.afterPatternEvaluation(userId)).not.toBeNull();
    await service.handlePrincipleApprovalMessage(message("아니", "discord:reject"));
    expect(await service.afterPatternEvaluation(userId)).toBeNull();
    const rows = await sql<{ rejected: number; patterns: number; evidence: number }[]>`
      select
        (select count(*)::int from public.principles where user_id=${userId} and source_pattern_id=${patternId} and confirmation_status='rejected') rejected,
        (select count(*)::int from public.patterns where user_id=${userId} and id=${patternId}) patterns,
        (select count(*)::int from public.pattern_evidence where pattern_id=${patternId}) evidence
    `;
    expect(rows[0]).toEqual({ rejected: 1, patterns: 1, evidence: 3 });
  });

  it("keeps proposals isolated by user", async () => {
    await addPattern(otherUserId, "reject", 3);
    expect(await repository.findPendingProposal(userId)).toBeNull();
    expect(await repository.findPendingProposal(otherUserId)).toBeNull();
    expect(await service.afterPatternEvaluation(userId)).toBeNull();
    expect(await repository.createEligibleProposal(otherUserId, now)).not.toBeNull();
  });
});
