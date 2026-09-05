import type { MorningObservation, MorningPlanDraft, TimeInterval } from "./morning.js";
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