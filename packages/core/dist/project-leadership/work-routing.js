export const routeStep = (step, precedingSteps) => {
    if (precedingSteps.some((candidate) => candidate.position < step.position && candidate.status !== "completed" && candidate.status !== "skipped")) {
        return "dependency_waiting";
    }
    return step.owner === "ai" ? "ai_executable" : "human_executable";
};
//# sourceMappingURL=work-routing.js.map