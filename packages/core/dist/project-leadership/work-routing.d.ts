import type { MaterializedRouteStatus } from "./backlog-approval.js";
export interface RoutableStep {
    readonly position: number;
    readonly owner: "user" | "ai";
    readonly status: string;
}
export declare const routeStep: (step: RoutableStep, precedingSteps: readonly RoutableStep[]) => MaterializedRouteStatus;
//# sourceMappingURL=work-routing.d.ts.map