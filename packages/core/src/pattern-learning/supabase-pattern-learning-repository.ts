import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import {
  derivePatternCandidates,
  PATTERN_EVALUATOR_VERSION,
  type PatternEvaluationResult,
  type PatternLearningCase,
  type PatternLearningEvaluator
} from "./pattern-learning.js";

interface LearningCaseRow {
  id: string;
  context_snapshot: unknown;
  decision_type: string;
  observed_at: Date;
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const mapCase = (row: LearningCaseRow): PatternLearningCase => {
  const snapshot = object(row.context_snapshot);
  return {
    id: row.id,
    decisionType: row.decision_type,
    situation: object(snapshot.situation),
    userChoice: object(snapshot.userChoice),
    userReason: typeof snapshot.userReason === "string" ? snapshot.userReason : null,
    observedOutcome: object(snapshot.observedOutcome),
    observedAt: row.observed_at
  };
};

export class SupabasePatternLearningRepository implements PatternLearningEvaluator {
  constructor(private readonly sql: Sql) {}

  async evaluatePatterns(userId: UserId): Promise<PatternEvaluationResult> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${userId}:pattern-learning`},0))`;
      const rows = await tx<LearningCaseRow[]>`
        select l.id,l.context_snapshot,d.impact->>'decisionType' decision_type,
          coalesce(l.closed_at,l.created_at) observed_at
        from public.learning_cases l
        join public.decisions d on d.id=l.decision_id and d.user_id=l.user_id
        where l.user_id=${userId} and l.case_type='decision' and l.status='closed'
        order by coalesce(l.closed_at,l.created_at),l.id
      `;
      const candidates = derivePatternCandidates(rows.map(mapCase));
      let created = 0;
      let strengthened = 0;
      for (const candidate of candidates) {
        const existing = await tx<{ id: string; evidence_count: number }[]>`
          select id,evidence_count from public.patterns
          where user_id=${userId} and evaluator_version=${PATTERN_EVALUATOR_VERSION}
            and condition->>'signature'=${candidate.signature}
          order by created_at limit 1 for update
        `;
        let patternId = existing[0]?.id;
        if (!patternId) {
          const inserted = await tx<{ id: string }[]>`
            insert into public.patterns(
              user_id,pattern_type,condition,observed_behavior,confidence,evidence_count,
              evaluator_version,status,first_observed_at,last_observed_at
            ) values(
              ${userId},'decision_preference',${tx.json({
                signature: candidate.signature,
                decisionType: candidate.decisionType,
                situationType: candidate.situationType,
                choiceAction: candidate.choiceAction,
                consistencyKind: candidate.consistencyKind,
                consistencyValue: candidate.consistencyValue
              })},${candidate.observedBehavior},${candidate.confidence},${candidate.evidence.length},
              ${PATTERN_EVALUATOR_VERSION},'candidate',${candidate.evidence[0]!.observedAt},
              ${candidate.evidence.at(-1)!.observedAt}
            ) returning id
          `;
          patternId = inserted[0]!.id;
          created += 1;
        }
        for (const evidence of candidate.evidence) {
          await tx`
            insert into public.pattern_evidence(pattern_id,learning_case_id,direction,weight,observed_at)
            values(${patternId},${evidence.id},'supports',1,${evidence.observedAt})
            on conflict(pattern_id,learning_case_id) do nothing
          `;
        }
        const count = await tx<{ count: number; first_at: Date; last_at: Date }[]>`
          select count(*)::int count,min(observed_at) first_at,max(observed_at) last_at
          from public.pattern_evidence where pattern_id=${patternId}
        `;
        await tx`
          update public.patterns set confidence=${candidate.confidence},evidence_count=${count[0]!.count},
            first_observed_at=${count[0]!.first_at},last_observed_at=${count[0]!.last_at},
            observed_behavior=${candidate.observedBehavior}
          where id=${patternId} and user_id=${userId}
        `;
        if (existing[0] && count[0]!.count > existing[0].evidence_count) strengthened += 1;
      }
      return { created, strengthened };
    });
  }
}
