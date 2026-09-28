import { DomainError } from "@amber/shared";
export const allowedTaskTransitions = {
    INBOX: ["PLANNED", "IN_PROGRESS", "SKIPPED", "CANCELLED"],
    PLANNED: ["IN_PROGRESS", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
    IN_PROGRESS: ["BLOCKED", "WAITING_FOR_USER", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
    BLOCKED: ["IN_PROGRESS", "WAITING_FOR_USER", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
    WAITING_FOR_USER: ["IN_PROGRESS", "BLOCKED", "DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"],
    DONE: [],
    CLOSED_PARTIAL: [],
    SKIPPED: [],
    CANCELLED: []
};
export const canTransitionTask = (previous, next) => allowedTaskTransitions[previous].includes(next);
export const assertTaskTransition = (previous, next) => {
    if (!canTransitionTask(previous, next)) {
        throw new DomainError("INVALID_TASK_TRANSITION", `Task cannot transition from ${previous} to ${next}`, {
            previousStatus: previous,
            nextStatus: next
        });
    }
};
//# sourceMappingURL=task-state-machine.js.map