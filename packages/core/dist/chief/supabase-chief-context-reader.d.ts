import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { MorningRepository } from "../morning/morning.js";
import type { ChiefContext, ChiefContextReader, ChiefRunRecord, ChiefRunRecorder } from "./chief.js";
export declare class SupabaseChiefContextReader implements ChiefContextReader {
    private readonly sql;
    private readonly observationReader;
    constructor(sql: Sql, observationReader: Pick<MorningRepository, "loadObservation">);
    loadChiefContext(userId: UserId, planDate: string, timeZone: string, now: Date): Promise<ChiefContext>;
}
export declare class SupabaseChiefRunRecorder implements ChiefRunRecorder {
    private readonly recorder;
    constructor(sql: Sql);
    findCompleted(userId: UserId, triggerId: string): Promise<ChiefRunRecord | null>;
    recordCompleted(input: Parameters<ChiefRunRecorder["recordCompleted"]>[0]): Promise<void>;
}
//# sourceMappingURL=supabase-chief-context-reader.d.ts.map