import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { WakeDeliveryClaim, WakeRepository, WakeSource, WakeTargetContext, WakeWorkflowRun } from "./wake.js";
export declare class SupabaseWakeRepository implements WakeRepository {
    private readonly sql;
    constructor(sql: Sql);
    findWorkflow(userId: UserId, targetDate: string): Promise<WakeWorkflowRun | null>;
    getOrCreateAwaitingWorkflow(userId: UserId, targetDate: string, timeZone: string, context: WakeTargetContext, now: Date): Promise<WakeWorkflowRun>;
    loadTargetContext(userId: UserId, targetDate: string, timeZone: string): Promise<WakeTargetContext>;
    schedule(run: WakeWorkflowRun, wakeAt: Date, source: WakeSource, messageId: string, now: Date): Promise<WakeWorkflowRun>;
    acknowledgeForDate(userId: UserId, targetDate: string, messageId: string, now: Date): Promise<void>;
    snooze(userId: UserId, targetDate: string, wakeAt: Date, messageId: string, now: Date): Promise<boolean>;
    claimDue(now: Date): Promise<WakeDeliveryClaim | null>;
    completeDelivery(claim: WakeDeliveryClaim, now: Date): Promise<void>;
    failDelivery(claim: WakeDeliveryClaim, error: string, now: Date): Promise<void>;
}
//# sourceMappingURL=supabase-wake-repository.d.ts.map