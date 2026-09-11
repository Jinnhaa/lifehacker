import type { UserId } from "@amber/shared";
import { z } from "zod";
export declare const PROJECT_LEADERSHIP_WORKFLOW_TYPE = "project_leadership_iteration";
export declare const PROJECT_LEADERSHIP_POLICY_VERSION = "project-leadership-v1";
export declare const sourceEvidenceSchema: z.ZodObject<{
    ref: z.ZodString;
    kind: z.ZodEnum<{
        work_context: "work_context";
        goal: "goal";
        objective: "objective";
        task: "task";
        task_step: "task_step";
        artifact: "artifact";
        decision: "decision";
        domain_event: "domain_event";
        external_reference: "external_reference";
    }>;
    freshness: z.ZodEnum<{
        unknown: "unknown";
        current: "current";
        stale: "stale";
    }>;
    observedAt: z.ZodNullable<z.ZodISODateTime>;
    contentHash: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const projectStateSnapshotSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1">;
    workContextId: z.ZodString;
    generatedAt: z.ZodISODateTime;
    project: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        status: z.ZodString;
        startDate: z.ZodNullable<z.ZodString>;
        endDate: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    primaryObjectiveId: z.ZodNullable<z.ZodString>;
    objectives: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        goalId: z.ZodNullable<z.ZodString>;
        title: z.ZodString;
        targetDate: z.ZodNullable<z.ZodString>;
        successCriteria: z.ZodNullable<z.ZodString>;
        importance: z.ZodNumber;
        status: z.ZodString;
    }, z.core.$strict>>;
    goals: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
    }, z.core.$strict>>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        objectiveId: z.ZodNullable<z.ZodString>;
        title: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        status: z.ZodString;
        importance: z.ZodNumber;
        officialDeadline: z.ZodNullable<z.ZodISODateTime>;
        internalDeadline: z.ZodNullable<z.ZodISODateTime>;
        nextAction: z.ZodNullable<z.ZodString>;
        completionCriteria: z.ZodNullable<z.ZodString>;
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            position: z.ZodNumber;
            title: z.ZodString;
            owner: z.ZodEnum<{
                user: "user";
                ai: "ai";
            }>;
            estimatedMinutes: z.ZodNullable<z.ZodNumber>;
            completionCriteria: z.ZodNullable<z.ZodString>;
            status: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    artifacts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        artifactType: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        taskId: z.ZodNullable<z.ZodString>;
        contentText: z.ZodNullable<z.ZodString>;
        contentHash: z.ZodNullable<z.ZodString>;
        verificationStatus: z.ZodNullable<z.ZodEnum<{
            unverified: "unverified";
            verified: "verified";
            failed: "failed";
        }>>;
        reviewStatus: z.ZodNullable<z.ZodEnum<{
            pending_review: "pending_review";
            accepted: "accepted";
            rejected: "rejected";
        }>>;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>>;
    decisions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        question: z.ZodString;
        whyNow: z.ZodString;
        status: z.ZodString;
        createdAt: z.ZodISODateTime;
        resolvedAt: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>>;
    recentEvents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        eventType: z.ZodString;
        aggregateType: z.ZodString;
        aggregateId: z.ZodString;
        occurredAt: z.ZodISODateTime;
        payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strict>>;
    sourceRefs: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        kind: z.ZodEnum<{
            work_context: "work_context";
            goal: "goal";
            objective: "objective";
            task: "task";
            task_step: "task_step";
            artifact: "artifact";
            decision: "decision";
            domain_event: "domain_event";
            external_reference: "external_reference";
        }>;
        freshness: z.ZodEnum<{
            unknown: "unknown";
            current: "current";
            stale: "stale";
        }>;
        observedAt: z.ZodNullable<z.ZodISODateTime>;
        contentHash: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    blockers: z.ZodArray<z.ZodObject<{
        taskId: z.ZodString;
        title: z.ZodString;
    }, z.core.$strict>>;
    unresolved: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const gapCandidateSchema: z.ZodObject<{
    key: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    evidenceRefs: z.ZodArray<z.ZodString>;
    priorityHint: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
    confidence: z.ZodNumber;
    blocking: z.ZodBoolean;
    rationale: z.ZodString;
}, z.core.$strict>;
export declare const gapAnalysisResultSchema: z.ZodObject<{
    gaps: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        evidenceRefs: z.ZodArray<z.ZodString>;
        priorityHint: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        confidence: z.ZodNumber;
        blocking: z.ZodBoolean;
        rationale: z.ZodString;
    }, z.core.$strict>>;
    unknowns: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const gapAnalysisArtifactSchema: z.ZodObject<{
    gaps: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        evidenceRefs: z.ZodArray<z.ZodString>;
        priorityHint: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        confidence: z.ZodNumber;
        blocking: z.ZodBoolean;
        rationale: z.ZodString;
    }, z.core.$strict>>;
    unknowns: z.ZodArray<z.ZodString>;
    schemaVersion: z.ZodLiteral<"1">;
    workContextId: z.ZodString;
    objectiveId: z.ZodNullable<z.ZodString>;
    sourceSnapshotArtifactId: z.ZodString;
    sourceRefs: z.ZodArray<z.ZodString>;
    generatedAt: z.ZodISODateTime;
}, z.core.$strict>;
export declare const backlogProposalItemSchema: z.ZodObject<{
    key: z.ZodString;
    sourceGapKey: z.ZodString;
    objectiveId: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    suggestedPriority: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
    suggestedOwner: z.ZodEnum<{
        ai: "ai";
        human: "human";
        hybrid: "hybrid";
    }>;
    acceptanceCriteria: z.ZodArray<z.ZodString>;
    dependencies: z.ZodArray<z.ZodString>;
    roughSize: z.ZodNullable<z.ZodEnum<{
        xs: "xs";
        s: "s";
        m: "m";
        l: "l";
        xl: "xl";
    }>>;
    evidenceRefs: z.ZodArray<z.ZodString>;
    risk: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const backlogRefinementResultSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        sourceGapKey: z.ZodString;
        objectiveId: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        suggestedPriority: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        suggestedOwner: z.ZodEnum<{
            ai: "ai";
            human: "human";
            hybrid: "hybrid";
        }>;
        acceptanceCriteria: z.ZodArray<z.ZodString>;
        dependencies: z.ZodArray<z.ZodString>;
        roughSize: z.ZodNullable<z.ZodEnum<{
            xs: "xs";
            s: "s";
            m: "m";
            l: "l";
            xl: "xl";
        }>>;
        evidenceRefs: z.ZodArray<z.ZodString>;
        risk: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    unknowns: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const backlogProposalArtifactSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        sourceGapKey: z.ZodString;
        objectiveId: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        suggestedPriority: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        suggestedOwner: z.ZodEnum<{
            ai: "ai";
            human: "human";
            hybrid: "hybrid";
        }>;
        acceptanceCriteria: z.ZodArray<z.ZodString>;
        dependencies: z.ZodArray<z.ZodString>;
        roughSize: z.ZodNullable<z.ZodEnum<{
            xs: "xs";
            s: "s";
            m: "m";
            l: "l";
            xl: "xl";
        }>>;
        evidenceRefs: z.ZodArray<z.ZodString>;
        risk: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    unknowns: z.ZodArray<z.ZodString>;
    schemaVersion: z.ZodLiteral<"1">;
    workContextId: z.ZodString;
    objectiveId: z.ZodNullable<z.ZodString>;
    sourceSnapshotArtifactId: z.ZodString;
    sourceGapAnalysisArtifactId: z.ZodString;
    sourceRefs: z.ZodArray<z.ZodString>;
    generatedAt: z.ZodISODateTime;
}, z.core.$strict>;
export type ProjectStateSnapshot = z.infer<typeof projectStateSnapshotSchema>;
export type GapAnalysisResult = z.infer<typeof gapAnalysisResultSchema>;
export type GapAnalysisArtifact = z.infer<typeof gapAnalysisArtifactSchema>;
export type BacklogRefinementResult = z.infer<typeof backlogRefinementResultSchema>;
export type BacklogProposalArtifact = z.infer<typeof backlogProposalArtifactSchema>;
export interface ProjectStateReviewInput {
    readonly userId: UserId;
    readonly workflowRunId: string;
    readonly snapshot: ProjectStateSnapshot;
}
export interface BacklogRefinementInput {
    readonly userId: UserId;
    readonly workflowRunId: string;
    readonly snapshot: ProjectStateSnapshot;
    readonly gapAnalysis: GapAnalysisArtifact;
    readonly constraints: readonly string[];
}
export interface ProjectLeadershipAnalysisProvider {
    reviewProjectState(input: ProjectStateReviewInput): Promise<unknown>;
    refineBacklog(input: BacklogRefinementInput): Promise<unknown>;
}
export interface ProjectLeadershipRunRequest {
    readonly userId: UserId;
    readonly workContextId: string;
    readonly timeZone: string;
    readonly idempotencyKey: string;
    readonly constraints?: readonly string[];
    readonly correlationId?: string;
    readonly causationId?: string;
}
export interface ProjectLeadershipArtifactRecord<T> {
    readonly id: string;
    readonly artifactType: "project_state_snapshot" | "gap_analysis" | "backlog_proposal";
    readonly contentHash: string;
    readonly content: T;
}
export interface ProjectLeadershipRunResult {
    readonly workflowRunId: string;
    readonly snapshot: ProjectLeadershipArtifactRecord<ProjectStateSnapshot>;
    readonly gapAnalysis: ProjectLeadershipArtifactRecord<GapAnalysisArtifact>;
    readonly backlogProposal: ProjectLeadershipArtifactRecord<BacklogProposalArtifact>;
}
export interface ProjectLeadershipWorkflowState {
    readonly id: string;
    readonly status: "running" | "completed" | "failed";
    readonly currentStep: "OBSERVE" | "DETECT_GAPS" | "PROPOSE_BACKLOG" | "COMPLETE";
    readonly checkpointVersion: number;
    readonly snapshot?: ProjectLeadershipArtifactRecord<ProjectStateSnapshot>;
    readonly gapAnalysis?: ProjectLeadershipArtifactRecord<GapAnalysisArtifact>;
    readonly backlogProposal?: ProjectLeadershipArtifactRecord<BacklogProposalArtifact>;
}
export interface ProjectLeadershipRepository {
    getOrCreateWorkflow(input: {
        readonly userId: UserId;
        readonly workContextId: string;
        readonly scopeId: string;
        readonly idempotencyKey: string;
        readonly contextPayload: Readonly<Record<string, unknown>>;
        readonly sourceRefs: readonly string[];
        readonly correlationId?: string;
        readonly causationId?: string;
        readonly now: Date;
    }): Promise<ProjectLeadershipWorkflowState>;
    saveSnapshot(userId: UserId, run: ProjectLeadershipWorkflowState, content: ProjectStateSnapshot, now: Date): Promise<ProjectLeadershipWorkflowState>;
    saveGapAnalysis(userId: UserId, run: ProjectLeadershipWorkflowState, content: GapAnalysisArtifact, now: Date): Promise<ProjectLeadershipWorkflowState>;
    saveBacklogProposal(userId: UserId, run: ProjectLeadershipWorkflowState, content: BacklogProposalArtifact, now: Date): Promise<ProjectLeadershipWorkflowState>;
}
//# sourceMappingURL=project-leadership.d.ts.map