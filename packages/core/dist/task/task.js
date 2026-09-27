export const taskStatuses = [
    "INBOX",
    "PLANNED",
    "IN_PROGRESS",
    "BLOCKED",
    "WAITING_FOR_USER",
    "DONE",
    "CLOSED_PARTIAL",
    "SKIPPED",
    "CANCELLED"
];
export const terminalTaskStatuses = ["DONE", "CLOSED_PARTIAL", "SKIPPED", "CANCELLED"];
export const isTerminalTaskStatus = (status) => terminalTaskStatuses.includes(status);
export const taskExecutionModes = ["standard", "learning_required", "output_focused", "mixed"];
//# sourceMappingURL=task.js.map