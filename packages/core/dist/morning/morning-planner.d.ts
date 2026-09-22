import type { Task } from "../task/task.js";
import type { MorningObservation, MorningPlanDraft, TimeInterval } from "./morning.js";
export interface TaskWorkload {
    readonly remainingMinutes: number;
    readonly targetDeadline: Date | null;
    readonly targetSource: "internal" | "official_default" | "none";
    readonly todayRequiredMinutes: number;
    readonly weekRequiredMinutes: number;
}
export declare const calculateTaskWorkload: (task: Task, now: Date, timeZone: string, localWeekday: number) => TaskWorkload;
export interface CreateMorningPlanInput {
    readonly observation: MorningObservation;
    readonly now: Date;
    readonly workUntil: Date;
    readonly privateIntervals: readonly TimeInterval[];
    readonly localWeekday: number;
    readonly maximumWorkMinutes?: number;
}
export declare const createMorningPlan: (input: CreateMorningPlanInput) => MorningPlanDraft;
//# sourceMappingURL=morning-planner.d.ts.map