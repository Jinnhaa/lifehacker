import type { MorningObservation, MorningPlanDraft } from "../morning/morning.js";
import type { ReplanDecision, ReplanPlanState } from "./replan.js";
export declare const classifyReplanImpact: (previous: ReplanPlanState, draft: MorningPlanDraft, observation: MorningObservation, localWeekday: number) => ReplanDecision;
//# sourceMappingURL=replan-impact.d.ts.map