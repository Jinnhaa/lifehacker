import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { type DerivedCurrentAction } from "../execution/current-action.js";
import type { BlockCategory, CompleteFocusResult, FocusContext, FocusRepository, FocusWorkflowRun, RecoveryResult, SwitchResult } from "./focus.js";
export declare class SupabaseFocusRepository implements FocusRepository {
    private readonly sql;
    constructor(sql: Sql);
    findCurrentWorkflow(userId: UserId): Promise<FocusWorkflowRun | null>;
    start(userId: UserId, planDate: string, now: Date, messageId: string): Promise<{
        context: FocusContext | null;
        action: DerivedCurrentAction | null;
        duplicate: boolean;
    }>;
    complete(userId: UserId, planDate: string, now: Date, messageId: string): Promise<CompleteFocusResult | null>;
    requestBlockReason(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null>;
    waitForBlockDetail(userId: UserId, category: "missing_material" | "other", initialDetail: string, now: Date, messageId: string): Promise<void>;
    recordBlock(userId: UserId, planDate: string, category: BlockCategory, detail: string, now: Date, messageId: string): Promise<RecoveryResult | null>;
    resume(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null>;
    requestSwitch(userId: UserId, now: Date, messageId: string): Promise<FocusContext | null>;
    confirmSwitch(userId: UserId, planDate: string, now: Date, messageId: string): Promise<SwitchResult | null>;
    private lockActive;
    private lockWorkflow;
    private updateWorkflow;
    private getContext;
    private splitCurrentStep;
}
//# sourceMappingURL=supabase-focus-repository.d.ts.map