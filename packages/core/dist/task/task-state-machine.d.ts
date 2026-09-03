import type { TaskStatus } from "./task.js";
export declare const allowedTaskTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>>;
export declare const canTransitionTask: (previous: TaskStatus, next: TaskStatus) => boolean;
export declare const assertTaskTransition: (previous: TaskStatus, next: TaskStatus) => void;
//# sourceMappingURL=task-state-machine.d.ts.map