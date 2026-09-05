import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { ApprovedPlanningPrinciple } from "./principle-application.js";
export declare class SupabasePrincipleReader {
    private readonly sql;
    constructor(sql: Sql);
    loadActiveApproved(userId: UserId): Promise<ApprovedPlanningPrinciple[]>;
}
//# sourceMappingURL=supabase-principle-reader.d.ts.map