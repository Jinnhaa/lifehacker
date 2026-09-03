import { DomainError } from "@amber/shared";
export const allowedTaskTransitions = {
    INBOX: ["PLANNED", "IN_PROGRESS"],
    PLANNED: ["IN_PROGRESS", "DONE"],
    IN_PROGRESS: ["BLOCKED", "WAITING_FOR_USER", "DONE"],
    BLOCKED: ["IN_PROGRESS", "WAITING_FOR_USER", "DONE"],
    WAITING_FOR_USER: ["IN_PROGRESS", "BLOCKED", "DONE"],
    DONE: []
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