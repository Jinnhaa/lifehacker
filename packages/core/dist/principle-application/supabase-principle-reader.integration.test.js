import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabasePrincipleReader } from "./supabase-principle-reader.js";
const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const userId = randomUUID();
const otherUserId = randomUUID();
const patternId = randomUUID();
const otherPatternId = randomUUID();
const now = new Date();
const reader = new SupabasePrincipleReader(sql);
beforeAll(async () => {
    await sql `
    insert into auth.users(id,email,created_at,updated_at) values
      (${userId},${`application-${userId}@example.test`},now(),now()),
      (${otherUserId},${`application-${otherUserId}@example.test`},now(),now())
  `;
    await sql `insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul'),(${otherUserId},'Asia/Seoul')`;
    const condition = sql.json({
        decisionType: "important_replan", situationType: "deadline_risk_increased", choiceAction: "approve",
        consistencyKind: "reason", consistencyValue: "deadline_priority"
    });
    await sql `
    insert into public.patterns(id,user_id,pattern_type,condition,observed_behavior,confidence,evidence_count,evaluator_version,status,first_observed_at,last_observed_at) values
      (${patternId},${userId},'decision_preference',${condition},'관찰',0.85,3,'decision-pattern-v0.1','candidate',${now},${now}),
      (${otherPatternId},${otherUserId},'decision_preference',${condition},'관찰',0.85,3,'decision-pattern-v0.1','candidate',${now},${now})
  `;
    await sql `
    insert into public.principles(user_id,source_pattern_id,statement,origin,created_by,confirmation_status,source_reference,valid_from,status) values
      (${userId},${patternId},'approved active','pattern_observed','system','approved',${sql.json({ applicationPolicy: "deadline_over_routine" })},${now},'active'),
      (${userId},${patternId},'candidate','pattern_observed','system','pending','{}',${now},'candidate'),
      (${userId},${patternId},'rejected','pattern_observed','system','rejected','{}',${now},'rejected'),
      (${userId},${patternId},'superseded','user_explicit','user','revised','{}',${now},'superseded'),
      (${otherUserId},${otherPatternId},'other user','pattern_observed','system','approved',${sql.json({ applicationPolicy: "deadline_over_routine" })},${now},'active')
  `;
});
afterAll(async () => {
    await sql `delete from auth.users where id in (${userId},${otherUserId})`;
    await sql.end();
});
describe("SupabasePrincipleReader", () => {
    it("loads only the user's approved active Principles", async () => {
        const principles = await reader.loadActiveApproved(userId);
        expect(principles).toHaveLength(1);
        expect(principles[0]).toMatchObject({
            id: expect.any(String), statement: "approved active", consistencyValue: "deadline_priority",
            applicationPolicy: "deadline_over_routine"
        });
        expect(principles.some((item) => item.statement === "other user")).toBe(false);
    });
});
//# sourceMappingURL=supabase-principle-reader.integration.test.js.map