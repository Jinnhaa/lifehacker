import type { Clock, UserId } from "@amber/shared";
import type { Task } from "../task/task.js";
import type { ResolvedWorkstyle, WorkstyleResolver } from "../workstyle/workstyle.js";

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
  readonly successCriteria: string | null;
  readonly importance: number;
  readonly status: string;
}

export interface ProjectTaskStep {
  readonly id: string;
  readonly taskId: string;
  readonly position: number;
  readonly title: string;
  readonly owner: "user" | "ai";
  readonly estimatedMinutes: number | null;
  readonly completionCriteria: string | null;
  readonly status: string;
  readonly skillKey: string | null;
}

export interface ProjectArtifact {
  readonly id: string;
  readonly artifactType: string;
  readonly title: string | null;
  readonly taskId: string | null;
  readonly workContextId: string | null;
  readonly contentText: string | null;
  readonly contentHash: string | null;
  readonly verificationStatus: "unverified" | "verified" | "failed" | null;
  readonly reviewStatus: "pending_review" | "accepted" | "rejected" | null;
  readonly createdAt: Date;
}

export interface ProjectDecision {
  readonly id: string;
  readonly question: string;
  readonly whyNow: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

export interface ProjectSourceReference {
  readonly id: string;
  readonly source: string;
  readonly externalType: string;
  readonly externalId: string;
  readonly externalVersion: string | null;
  readonly internalEntityType: string;
  readonly internalEntityId: string;
  readonly syncStatus: "active" | "stale" | "deleted" | "conflict";
  readonly contentHash: string | null;
  readonly lastSeenAt: Date;
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
  readonly payload: Readonly<Record<string, unknown>>;
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
  readonly taskSteps: readonly ProjectTaskStep[];
  readonly artifacts: readonly ProjectArtifact[];
  readonly decisions: readonly ProjectDecision[];
  readonly sourceReferences: readonly ProjectSourceReference[];
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
    readonly correlationId?: string;
    readonly startedAt: Date;
    readonly completedAt: Date;
    readonly workstyle?: ResolvedWorkstyle;
  }): Promise<void>;
}

export interface ProjectPmMessage {
  readonly userId: UserId;
  readonly timeZone: string;
  readonly text: string;
  readonly messageId: string;
  readonly receivedAt: Date;
  readonly currentInstruction?: string;
}

export interface ProjectPmMessageResult {
  readonly handled: boolean;
  readonly reply?: string;
  readonly report?: ProjectPmReport;
}

export interface ProjectPmReport {
  readonly project: { readonly id: string; readonly title: string };
  readonly status: {
    readonly open: number;
    readonly done: number;
    readonly inProgress: number;
    readonly blocked: number;
    readonly overdue: number;
    readonly dueSoon: number;
  };
  readonly nextAction: {
    readonly taskId: string;
    readonly title: string;
    readonly remainingMinutes: number | null;
  } | null;
  readonly blockers: readonly string[];
  readonly nearestDeadline: {
    readonly taskId: string;
    readonly title: string;
    readonly at: Date;
  } | null;
  readonly warnings: readonly string[];
}

export interface ProjectPmReportRequest {
  readonly userId: UserId;
  readonly timeZone: string;
  readonly projectName: string;
  readonly requestKind: ProjectPmRequestKind;
  readonly triggerId: string;
  readonly source: string;
  readonly receivedAt: Date;
  readonly correlationId?: string;
  readonly currentInstruction?: string;
}

export interface ProjectPmMessageHandler {
  handleProjectPmMessage(message: ProjectPmMessage): Promise<ProjectPmMessageResult>;
}

export interface ProjectPmServiceDependencies {
  readonly repository: ProjectPmRepository;
  readonly clock: Clock;
  readonly runRecorder?: ProjectPmRunRecorder;
  readonly workstyleResolver?: WorkstyleResolver;
}
