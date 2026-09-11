import type { MaterializedRouteStatus } from "./backlog-approval.js";

export interface RoutableStep {
  readonly position: number;
  readonly owner: "user" | "ai";
  readonly status: string;
}

export const routeStep = (step: RoutableStep, precedingSteps: readonly RoutableStep[]): MaterializedRouteStatus => {
  if (precedingSteps.some((candidate) => candidate.position < step.position && candidate.status !== "completed" && candidate.status !== "skipped")) {
    return "dependency_waiting";
  }
  return step.owner === "ai" ? "ai_executable" : "human_executable";
};
