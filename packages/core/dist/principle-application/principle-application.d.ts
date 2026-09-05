export interface ApprovedPlanningPrinciple {
    readonly id: string;
    readonly statement: string;
    readonly origin: string;
    readonly decisionType: string;
    readonly situationType: string;
    readonly choiceAction: string;
    readonly consistencyKind: string;
    readonly consistencyValue: string;
    readonly applicationPolicy: string;
}
export interface PlanningPriorityCandidate {
    readonly type: "task" | "routine";
    readonly id: string;
    readonly rank: number;
    readonly importance: number;
    readonly deadline: Date | null;
    readonly title: string;
}
export interface AppliedPrincipleResult<T extends PlanningPriorityCandidate> {
    readonly candidates: readonly T[];
    readonly usedPrincipleIds: readonly string[];
    readonly explanation: string | null;
}
export declare const applyApprovedPrinciples: <T extends PlanningPriorityCandidate>(candidates: readonly T[], principles: readonly ApprovedPlanningPrinciple[], now: Date, timeZone: string) => AppliedPrincipleResult<T>;
//# sourceMappingURL=principle-application.d.ts.map