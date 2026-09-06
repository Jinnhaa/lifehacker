import type { Clock, UserId } from "@amber/shared";
import type { Task } from "../task/task.js";
export type ProjectPmRequestKind = "status" | "next_action";
export interface ProjectWorkContext {
    readonly id: string;
    readonly userId: UserId;
    readonly scopeId: string | null;
    readonly title: string;
    readonly description: string | null;
    readonly status: string;
    readonly startDate: string | null;
    readonly endDate: string | null;
}
export interface ProjectObjective {
    readonly id: string;
    readonly title: string;
    readonly goalId: string | null;
    readonly targetDate: string | null;
    readonly importance: number;
    readonly status: string;
}
export interface ProjectGoal {
    readonly id: string;
    readonly title: string;
    readonly status: string;
}
export interface ProjectPlanTask {
    readonly taskId: string;
    readonly position: number;
}
export interface ProjectFocusTask {
    readonly sessionId: string;
    readonly taskId: string;
    readonly title: string;
    readonly startedAt: Date;
}
export interface ProjectDomainEvent {
    readonly id: string;
    readonly eventType: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly occurredAt: Date;
}
export interface ProjectPmContext {
    readonly userId: UserId;
    readonly project: ProjectWorkContext;
    readonly observedAt: Date;
    readonly planDate: string;
    readonly timeZone: string;
    readonly objectives: readonly ProjectObjective[];
    readonly goals: readonly ProjectGoal[];
    readonly tasks: readonly Task[];
    readonly activeFocus: ProjectFocusTask | null;
    readonly approvedPlanTasks: readonly ProjectPlanTask[];
    readonly recentEvents: readonly ProjectDomainEvent[];
}
export interface ProjectPmRepository {
    listProjects(userId: UserId): Promise<readonly ProjectWorkContext[]>;
    loadProjectContext(userId: UserId, project: ProjectWorkContext, planDate: string, timeZone: string, now: Date): Promise<ProjectPmContext>;
}
export interface ProjectPmRunRecorder {
    findCompleted(userId: UserId, triggerId: string): Promise<string | null>;
    recordCompleted(input: {
        readonly context: ProjectPmContext;
        readonly requestKind: ProjectPmRequestKind;
        readonly triggerId: string;
        readonly source: string;
        readonly reply: string;
        readonly nextTaskId: string | null;
        readonly startedAt: Date;
        readonly completedAt: Date;
    }): Promise<void>;
}
export interface ProjectPmMessage {
    readonly userId: UserId;
    readonly timeZone: string;
    readonly text: string;
    readonly messageId: string;
    readonly receivedAt: Date;
}
export interface ProjectPmMessageResult {
    readonly handled: boolean;
    readonly reply?: string;
}
export interface ProjectPmReportRequest {
    readonly userId: UserId;
    readonly timeZone: string;
    readonly projectName: string;
    readonly requestKind: ProjectPmRequestKind;
    readonly triggerId: string;
    readonly source: string;
    readonly receivedAt: Date;
}
export interface ProjectPmMessageHandler {
    handleProjectPmMessage(message: ProjectPmMessage): Promise<ProjectPmMessageResult>;
}
export interface ProjectPmServiceDependencies {
    readonly repository: ProjectPmRepository;
    readonly clock: Clock;
    readonly runRecorder?: ProjectPmRunRecorder;
}
//# sourceMappingURL=project-pm.d.ts.map