import { z } from "zod";
export const PROJECT_LEADERSHIP_WORKFLOW_TYPE = "project_leadership_iteration";
export const PROJECT_LEADERSHIP_POLICY_VERSION = "project-leadership-v1";
export const sourceEvidenceSchema = z.object({
    ref: z.string().trim().min(1),
    kind: z.enum(["work_context", "goal", "objective", "task", "task_step", "artifact", "decision", "domain_event", "external_reference"]),
    freshness: z.enum(["current", "stale", "unknown"]),
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    contentHash: z.string().trim().min(1).nullable()
}).strict();
const taskStepSnapshotSchema = z.object({
    id: z.string().min(1), position: z.number().int().positive(), title: z.string().min(1),
    owner: z.enum(["user", "ai"]), estimatedMinutes: z.number().int().nonnegative().nullable(),
    completionCriteria: z.string().nullable(), status: z.string().min(1)
}).strict();
const taskSnapshotSchema = z.object({
    id: z.string().min(1), objectiveId: z.string().nullable(), title: z.string().min(1), description: z.string().nullable(),
    status: z.string().min(1), importance: z.number().int(), officialDeadline: z.iso.datetime({ offset: true }).nullable(),
    internalDeadline: z.iso.datetime({ offset: true }).nullable(), nextAction: z.string().nullable(),
    completionCriteria: z.string().nullable(), steps: z.array(taskStepSnapshotSchema)
}).strict();
const objectiveSnapshotSchema = z.object({
    id: z.string().min(1), goalId: z.string().nullable(), title: z.string().min(1), targetDate: z.string().nullable(),
    successCriteria: z.string().nullable(), importance: z.number().int(), status: z.string().min(1)
}).strict();
export const projectStateSnapshotSchema = z.object({
    schemaVersion: z.literal("1"),
    workContextId: z.string().min(1),
    generatedAt: z.iso.datetime({ offset: true }),
    project: z.object({
        id: z.string().min(1), title: z.string().min(1), description: z.string().nullable(), status: z.string().min(1),
        startDate: z.string().nullable(), endDate: z.string().nullable()
    }).strict(),
    primaryObjectiveId: z.string().nullable(),
    objectives: z.array(objectiveSnapshotSchema),
    goals: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), status: z.string().min(1) }).strict()),
    tasks: z.array(taskSnapshotSchema),
    artifacts: z.array(z.object({
        id: z.string().min(1), artifactType: z.string().min(1), title: z.string().nullable(), taskId: z.string().nullable(),
        contentText: z.string().nullable(), contentHash: z.string().nullable(),
        verificationStatus: z.enum(["unverified", "verified", "failed"]).nullable(),
        reviewStatus: z.enum(["pending_review", "accepted", "rejected"]).nullable(),
        createdAt: z.iso.datetime({ offset: true })
    }).strict()),
    decisions: z.array(z.object({
        id: z.string().min(1), question: z.string().min(1), whyNow: z.string().min(1), status: z.string().min(1),
        createdAt: z.iso.datetime({ offset: true }), resolvedAt: z.iso.datetime({ offset: true }).nullable()
    }).strict()),
    recentEvents: z.array(z.object({
        id: z.string().min(1), eventType: z.string().min(1), aggregateType: z.string().min(1),
        aggregateId: z.string().min(1), occurredAt: z.iso.datetime({ offset: true }), payload: z.record(z.string(), z.unknown())
    }).strict()),
    sourceRefs: z.array(sourceEvidenceSchema),
    blockers: z.array(z.object({ taskId: z.string().min(1), title: z.string().min(1) }).strict()),
    unresolved: z.array(z.string().min(1))
}).strict();
export const gapCandidateSchema = z.object({
    key: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1),
    priorityHint: z.enum(["low", "medium", "high", "critical"]),
    confidence: z.number().min(0).max(1),
    blocking: z.boolean(),
    rationale: z.string().trim().min(1)
}).strict();
export const gapAnalysisResultSchema = z.object({
    gaps: z.array(gapCandidateSchema),
    unknowns: z.array(z.string().trim().min(1))
}).strict();
export const gapAnalysisArtifactSchema = gapAnalysisResultSchema.extend({
    schemaVersion: z.literal("1"),
    workContextId: z.string().min(1),
    objectiveId: z.string().nullable(),
    sourceSnapshotArtifactId: z.string().min(1),
    sourceRefs: z.array(z.string().min(1)),
    generatedAt: z.iso.datetime({ offset: true })
}).strict();
export const backlogProposalItemSchema = z.object({
    key: z.string().trim().min(1),
    sourceGapKey: z.string().trim().min(1),
    objectiveId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    suggestedPriority: z.enum(["low", "medium", "high", "critical"]),
    suggestedOwner: z.enum(["human", "ai", "hybrid"]),
    acceptanceCriteria: z.array(z.string().trim().min(1)).min(1),
    dependencies: z.array(z.string().trim().min(1)),
    roughSize: z.enum(["xs", "s", "m", "l", "xl"]).nullable(),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1),
    risk: z.string().trim().min(1).nullable()
}).strict();
export const backlogRefinementResultSchema = z.object({
    items: z.array(backlogProposalItemSchema),
    unknowns: z.array(z.string().trim().min(1))
}).strict();
export const backlogProposalArtifactSchema = backlogRefinementResultSchema.extend({
    schemaVersion: z.literal("1"),
    workContextId: z.string().min(1),
    objectiveId: z.string().nullable(),
    sourceSnapshotArtifactId: z.string().min(1),
    sourceGapAnalysisArtifactId: z.string().min(1),
    sourceRefs: z.array(z.string().min(1)),
    generatedAt: z.iso.datetime({ offset: true })
}).strict();
//# sourceMappingURL=project-leadership.js.map