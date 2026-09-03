export const getTaskEventType = (previous, next) => {
    if (next === "PLANNED")
        return "task_planned";
    if (next === "BLOCKED")
        return "task_blocked";
    if (next === "WAITING_FOR_USER")
        return "task_waiting_for_user";
    if (next === "DONE")
        return "task_completed";
    if (next === "IN_PROGRESS" && (previous === "BLOCKED" || previous === "WAITING_FOR_USER")) {
        return "task_resumed";
    }
    return "task_started";
};
//# sourceMappingURL=task-event.js.map