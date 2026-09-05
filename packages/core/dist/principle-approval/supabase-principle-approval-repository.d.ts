import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { PrincipleApprovalRepository, PrincipleProposal } from "./principle-approval.js";
export declare class SupabasePrincipleApprovalRepository implements PrincipleApprovalRepository {
    private readonly sql;
    constructor(sql: Sql);
    createEligibleProposal(userId: UserId, now: Date): Promise<PrincipleProposal | null>;
    findPendingProposal(userId: UserId): Promise<PrincipleProposal | null>;
    findReplyByMessage(userId: UserId, messageId: string): Promise<string | null>;
    approve(proposal: PrincipleProposal, messageId: string, now: Date, reply: string): Promise<void>;
    reject(proposal: PrincipleProposal, messageId: string, _now: Date, reply: string): Promise<void>;
    revise(proposal: PrincipleProposal, statement: string, messageId: string, now: Date, reply: string): Promise<PrincipleProposal>;
}
//# sourceMappingURL=supabase-principle-approval-repository.d.ts.map