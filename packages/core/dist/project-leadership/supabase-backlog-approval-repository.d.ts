import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { type BacklogApprovalRecord, type BacklogApprovalRepository, type BacklogApprovalResult } from "./backlog-approval.js";
export declare class SupabaseBacklogApprovalRepository implements BacklogApprovalRepository {
    private readonly sql;
    constructor(sql: Sql);
    requestApproval(input: Parameters<BacklogApprovalRepository["requestApproval"]>[0]): Promise<BacklogApprovalRecord>;
    getApproval(userId: UserId, approvalRequestId: string): Promise<BacklogApprovalRecord | null>;
    expireStale(userId: UserId, approvalRequestId: string, now: Date): Promise<void>;
    materialize(input: Parameters<BacklogApprovalRepository["materialize"]>[0]): Promise<BacklogApprovalResult>;
    private getApprovalByWorkflow;
    private mapApproval;
    private loadMaterializedResult;
}
//# sourceMappingURL=supabase-backlog-approval-repository.d.ts.map