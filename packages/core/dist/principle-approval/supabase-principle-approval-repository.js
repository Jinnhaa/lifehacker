import { MIN_PATTERN_EVIDENCE } from "../pattern-learning/pattern-learning.js";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
const mapProposal = (row) => {
    const reference = object(row.source_reference);
    return {
        id: row.id,
        userId: row.user_id,
        patternId: row.source_pattern_id,
        statement: row.statement,
        evidenceCount: row.evidence_count,
        revision: typeof reference.revision === "number" ? reference.revision : 1,
        origin: row.origin === "user_explicit" ? "user_explicit" : "pattern_observed"
    };
};
const statementFor = (condition) => {
    const situation = typeof condition.situationType === "string" ? condition.situationType : "";
    const action = typeof condition.choiceAction === "string" ? condition.choiceAction : "";
    if (situation.includes("deadline") && action === "approve")
        return "마감 위험이 있는 중요한 일정 변경에서는 제안된 변경을 적용한다";
    if (situation.includes("deadline") && action === "reject")
        return "마감 위험이 있는 중요한 일정 변경에서는 제안된 변경을 적용하지 않는다";
    if (situation.includes("deadline") && action === "exclude_tasks")
        return "마감 위험이 있는 Morning 계획에서는 해당 Task 제외 선택을 유지한다";
    if (situation.includes("protected_routine") && action === "approve")
        return "보호된 루틴이 영향을 받는 변경은 확인 후 적용한다";
    if (action === "switch_task")
        return "Focus 전환 확인 이후에는 다른 Task로 전환한다";
    if (action === "approve")
        return "비슷한 중요한 일정 변경에서는 확인한 제안을 적용한다";
    if (action === "reject")
        return "비슷한 중요한 일정 변경에서는 확인한 제안을 적용하지 않는다";
    return `비슷한 상황에서는 ${action} 선택을 유지한다`;
};
export class SupabasePrincipleApprovalRepository {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async createEligibleProposal(userId, now) {
        return this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${userId}:principle-proposal`},0))`;
            const patterns = await tx `
        select p.id,p.condition,
          (select count(*)::int from public.pattern_evidence e where e.pattern_id=p.id) evidence_count
        from public.patterns p
        where p.user_id=${userId} and p.status='candidate' and p.evidence_count>=${MIN_PATTERN_EVIDENCE}
          and (select count(*) from public.pattern_evidence e where e.pattern_id=p.id)>=${MIN_PATTERN_EVIDENCE}
          and not exists(select 1 from public.principles r where r.user_id=p.user_id and r.source_pattern_id=p.id)
        order by p.evidence_count desc,p.first_observed_at limit 1 for update
      `;
            const pattern = patterns[0];
            if (!pattern)
                return null;
            const evidence = await tx `
        select learning_case_id from public.pattern_evidence where pattern_id=${pattern.id} order by observed_at
      `;
            const inserted = await tx `
        insert into public.principles(
          user_id,source_pattern_id,statement,origin,created_by,confirmation_status,source_reference,
          valid_from,status
        ) values(
          ${userId},${pattern.id},${statementFor(object(pattern.condition))},'pattern_observed','system','pending',
          ${tx.json({ revision: 1, evidenceLearningCaseIds: evidence.map((item) => item.learning_case_id) })},
          ${now},'candidate'
        ) returning *,${pattern.evidence_count}::int evidence_count
      `;
            return mapProposal(inserted[0]);
        });
    }
    async findPendingProposal(userId) {
        const rows = await this.sql `
      select r.*,p.evidence_count from public.principles r
      join public.patterns p on p.id=r.source_pattern_id and p.user_id=r.user_id
      where r.user_id=${userId} and r.confirmation_status='pending' and r.status='candidate'
      order by r.created_at desc limit 1
    `;
        return rows[0] ? mapProposal(rows[0]) : null;
    }
    async findReplyByMessage(userId, messageId) {
        const rows = await this.sql `
      select source_reference->>'lastReply' reply from public.principles
      where user_id=${userId} and source_reference->>'lastMessageId'=${messageId}
      order by created_at desc limit 1
    `;
        return rows[0]?.reply ?? null;
    }
    async approve(proposal, messageId, now, reply) {
        await this.sql `
      update public.principles set confirmation_status='approved',status='active',approved_at=${now},
        source_reference=source_reference || ${this.sql.json({ lastMessageId: messageId, lastReply: reply, approvalProvenance: "user_explicit" })}
      where id=${proposal.id} and user_id=${proposal.userId} and confirmation_status='pending'
    `;
    }
    async reject(proposal, messageId, _now, reply) {
        await this.sql `
      update public.principles set confirmation_status='rejected',status='rejected',
        source_reference=source_reference || ${this.sql.json({ lastMessageId: messageId, lastReply: reply, rejectionProvenance: "user_explicit" })}
      where id=${proposal.id} and user_id=${proposal.userId} and confirmation_status='pending'
    `;
    }
    async revise(proposal, statement, messageId, now, reply) {
        return this.sql.begin(async (tx) => {
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${proposal.userId}:principle:${proposal.patternId}`},0))`;
            await tx `
        update public.principles set confirmation_status='revised',status='superseded',
          source_reference=source_reference || ${tx.json({ lastMessageId: messageId, lastReply: reply })}
        where id=${proposal.id} and user_id=${proposal.userId} and confirmation_status='pending'
      `;
            const inserted = await tx `
        insert into public.principles(
          user_id,source_pattern_id,statement,origin,created_by,confirmation_status,source_reference,valid_from,status
        ) values(
          ${proposal.userId},${proposal.patternId},${statement},'user_explicit','user','pending',
          ${tx.json({ revision: proposal.revision + 1, supersedesPrincipleId: proposal.id, modificationMessageId: messageId, modificationProvenance: "user_explicit" })},
          ${now},'candidate'
        ) returning *,${proposal.evidenceCount}::int evidence_count
      `;
            return mapProposal(inserted[0]);
        });
    }
}
//# sourceMappingURL=supabase-principle-approval-repository.js.map