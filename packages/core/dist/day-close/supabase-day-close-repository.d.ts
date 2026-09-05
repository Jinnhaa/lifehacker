import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { DayCloseObservation, DayCloseRepository, DayCloseResult, DayCloseWorkflowRun } from "./day-close.js";
export declare class SupabaseDayCloseRepository implements DayCloseRepository {
    private readonly sql;
    constructor(sql: Sql);
    getOrCreateWorkflow(userId: UserId, date: string, timeZone: string, now: Date): Promise<DayCloseWorkflowRun>;
    findWorkflow(userId: UserId, date: string): Promise<DayCloseWorkflowRun | null>;
    hasActiveFocus(userId: UserId): Promise<boolean>;
    awaitFocusConfirmation(run: DayCloseWorkflowRun, messageId: string, now: Date): Promise<DayCloseWorkflowRun>;
    closeActiveFocus(run: DayCloseWorkflowRun, messageId: string, now: Date): Promise<void>;
    loadObservation(userId: UserId, date: string, timeZone: string): Promise<DayCloseObservation>;
    complete(run: DayCloseWorkflowRun, result: DayCloseResult, messageId: string, now: Date): Promise<{
        result: DayCloseResult;
        duplicate: boolean;
    }>;
}
//# sourceMappingURL=supabase-day-close-repository.d.ts.map