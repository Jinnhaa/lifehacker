import type { MorningObservation, MorningPlanDraft } from "../morning/morning.js";
import type { BuildReplanDraftInput, DirectPlanEdit, DirectPlanEditInterpretation, ReplanPlanState } from "./replan.js";
export declare const resolveReplanWorkUntil: (observation: MorningObservation, previous: BuildReplanDraftInput["previous"]) => Date;
export declare const applyDirectPlanEdit: (previous: ReplanPlanState, edit: DirectPlanEdit, context?: string | null) => {
    readonly draft: MorningPlanDraft;
    readonly interpretation: DirectPlanEditInterpretation;
};
export declare const buildReplanDraft: (input: BuildReplanDraftInput) => MorningPlanDraft;
//# sourceMappingURL=replan-planner.d.ts.map