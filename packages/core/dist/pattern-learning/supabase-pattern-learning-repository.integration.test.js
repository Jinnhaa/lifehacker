import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabasePatternLearningRepository } from "./supabase-pattern-learning-repository.js";
const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userId = randomUUID();
const otherUserId = randomUUID();
const now = new Date("2026-09-04T12:00:00.000Z");
const repository = new SupabasePatternLearningRepository(sql);
beforeAll(async () => {
    await sql `
    insert into auth.users(id,email,created_at,updated_at) values
      (${userId},${`pattern-${userId}@example.test`},now(),now()),
      (${otherUserId},${`pattern-${otherUserId}@example.test`},now(),now())
  `;
    await sql `insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${otherUserId},'Asia/Seoul')`;
});
afterAll(async () => {
    await sql `delete from auth.users where id in (${userId},${otherUserId})`;
    await sql.end();
});
const addCase = async (owner, sequence) => {
    const decisionId = randomUUID();
    const feedbackId = randomUUID();
    const learningCaseId = randomUUID();
    const observedAt = new Date(now.getTime() + sequence * 60_000);
    await sql `
    insert into public.decisions(id,user_id,question,options,impact,status,created_at)
    values(${decisionId},${owner},'중요한 변경','[]',${sql.json({
        decisionType: "important_replan", context: { impactReasons: ["deadline_risk_increased"] }
    })},'resolved',${observedAt})
  `;
    await sql `
    insert into public.decision_feedback(id,user_id,decision_id,user_choice,user_reason)
    values(${feedbackId},${owner},${decisionId},${sql.json({ action: "reject", reasonProvenance: "user_explicit" })},'마감 과제가 더 중요해서')
  `;
    await sql `
    insert into public.learning_cases(
      id,user_id,case_type,context_snapshot,decision_id,decision_feedback_id,status,closed_at
    ) values(${learningCaseId},${owner},'decision',${sql.json({
        situation: { impactReasons: ["deadline_risk_increased"] },
        userChoice: { action: "reject", reasonProvenance: "user_explicit" },
        userReason: "마감 과제가 더 중요해서",
        observedOutcome: { completedTaskIds: [`task-${sequence}`], blockedTaskIds: [], varianceMinutes: -10 }
    })},${decisionId},${feedbackId},'closed',${observedAt})
  `;
    return learningCaseId;
};
describe("Supabase Pattern Learning", () => {
    it("creates no Pattern for two cases, then links three cases to one candidate idempotently", async () => {
        await addCase(userId, 1);
        await addCase(userId, 2);
        expect(await repository.evaluatePatterns(userId)).toEqual({ created: 0, strengthened: 0 });
        await addCase(userId, 3);
        expect(await repository.evaluatePatterns(userId)).toEqual({ created: 1, strengthened: 0 });
        expect(await repository.evaluatePatterns(userId)).toEqual({ created: 0, strengthened: 0 });
        const rows = await sql `
      select
        (select count(*)::int from public.patterns where user_id=${userId}) patterns,
        (select count(*)::int from public.pattern_evidence e join public.patterns p on p.id=e.pattern_id where p.user_id=${userId}) evidence,
        (select count(*)::int from public.principles where user_id=${userId}) principles,
        (select status from public.patterns where user_id=${userId} limit 1) status
    `;
        expect(rows[0]).toEqual({ patterns: 1, evidence: 3, principles: 0, status: "candidate" });
    });
    it("strengthens the existing Pattern with new evidence without duplication", async () => {
        const fourth = await addCase(userId, 4);
        expect(await repository.evaluatePatterns(userId)).toEqual({ created: 0, strengthened: 1 });
        expect(await repository.evaluatePatterns(userId)).toEqual({ created: 0, strengthened: 0 });
        const rows = await sql `
      select p.evidence_count,
        count(*) filter(where e.learning_case_id=${fourth})::int linked
      from public.patterns p join public.pattern_evidence e on e.pattern_id=p.id
      where p.user_id=${userId} group by p.id
    `;
        expect(rows[0]).toEqual({ evidence_count: 4, linked: 1 });
    });
    it("does not read or attach another user's LearningCases", async () => {
        await addCase(otherUserId, 1);
        await addCase(otherUserId, 2);
        await addCase(otherUserId, 3);
        expect(await repository.evaluatePatterns(userId)).toEqual({ created: 0, strengthened: 0 });
        const rows = await sql `
      select
        (select count(*)::int from public.patterns where user_id=${otherUserId}) patterns,
        (select count(*)::int from public.pattern_evidence e
          join public.patterns p on p.id=e.pattern_id
          join public.learning_cases l on l.id=e.learning_case_id
          where p.user_id=${userId} and l.user_id=${otherUserId}) foreign_evidence
    `;
        expect(rows[0]).toEqual({ patterns: 0, foreign_evidence: 0 });
    });
});
//# sourceMappingURL=supabase-pattern-learning-repository.integration.test.js.map