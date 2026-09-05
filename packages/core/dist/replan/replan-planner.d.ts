import type { MorningObservation, MorningPlanDraft } from "../morning/morning.js";
import type { BuildReplanDraftInput } from "./replan.js";
export declare const resolveReplanWorkUntil: (observation: MorningObservation, previous: BuildReplanDraftInput["previous"]) => Date;
export declare const buildReplanDraft: (input: BuildReplanDraftInput) => MorningPlanDraft;
//# sourceMappingURL=replan-planner.d.ts.map