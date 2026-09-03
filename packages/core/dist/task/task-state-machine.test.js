import { describe, expect, it } from "vitest";
import { taskStatuses } from "./task.js";
import { getTaskEventType } from "./task-event.js";
import { allowedTaskTransitions, assertTaskTransition, canTransitionTask } from "./task-state-machine.js";
describe("Task State Machine", () => {
    for (const previous of taskStatuses) {
        for (const next of taskStatuses) {
            const expected = allowedTaskTransitions[previous].includes(next);
            it(`${previous} -> ${next} is ${expected ? "allowed" : "rejected"}`, () => {
                expect(canTransitionTask(previous, next)).toBe(expected);
                if (expected) {
                    expect(() => assertTaskTransition(previous, next)).not.toThrow();
                }
                else {
                    expect(() => assertTaskTransition(previous, next)).toThrowError(expect.objectContaining({ code: "INVALID_TASK_TRANSITION" }));
                }
            });
        }
    }
});
describe("Task transition event mapping", () => {
    it.each([
        ["INBOX", "PLANNED", "task_planned"],
        ["INBOX", "IN_PROGRESS", "task_started"],
        ["PLANNED", "DONE", "task_completed"],
        ["IN_PROGRESS", "BLOCKED", "task_blocked"],
        ["IN_PROGRESS", "WAITING_FOR_USER", "task_waiting_for_user"],
        ["BLOCKED", "IN_PROGRESS", "task_resumed"],
        ["WAITING_FOR_USER", "IN_PROGRESS", "task_resumed"]
    ])("maps %s -> %s to %s", (previous, next, eventType) => {
        expect(getTaskEventType(previous, next)).toBe(eventType);
    });
});
//# sourceMappingURL=task-state-machine.test.js.map