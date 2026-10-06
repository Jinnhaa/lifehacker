import type { UserId } from "@amber/shared";
import type { JSONValue } from "postgres";
import { z } from "zod";
import type { AssessmentScopeConfig } from "./course-recipe.js";

export const learningStageStatusSchema = z.enum(["NOT_STARTED", "ACTIVE", "COMPLETED", "ARCHIVED"]);
export const learningStageCompletionModeSchema = z.enum(["MANUAL", "ALL_REQUIRED_MATERIALS", "ASSESSMENT_THRESHOLD"]);
export const learningStageTransitionModeSchema = z.enum(["MANUAL", "SEQUENTIAL", "PARALLEL"]);
export const learningMaterialStatusSchema = z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]);
export const learningTrackingModeSchema = z.enum(["UNIT_COUNT", "LEARNING_STATE", "TIME", "UNTRACKED"]);
export const learningRecoveryModeSchema = z.enum(["REDISTRIBUTE", "RESET", "CARRY_FORWARD", "MANUAL"]);
export const learningTargetExecutionStatusSchema = z.enum(["PENDING", "COMPLETED", "PARTIAL", "SKIPPED", "CANCELLED"]);
export const learningTargetRoleSchema = z.enum(["EXECUTION_TARGET", "RELATED_SCOPE", "RECOMMENDED_READINESS"]);
export const learningAssessmentTypeSchema = z.enum([
  "quiz", "midterm", "final", "assignment", "project", "team_project", "exam", "mock_exam", "attendance", "other"
]);

export type LearningConfig = Readonly<Record<string, JSONValue>>;
export type LearningStageCompletionMode = z.infer<typeof learningStageCompletionModeSchema>;
export type LearningStageTransitionMode = z.infer<typeof learningStageTransitionModeSchema>;
export type LearningTrackingMode = z.infer<typeof learningTrackingModeSchema>;
export type LearningRecoveryMode = z.infer<typeof learningRecoveryModeSchema>;
export type LearningTargetExecutionStatus = z.infer<typeof learningTargetExecutionStatusSchema>;
export type LearningTargetRole = z.infer<typeof learningTargetRoleSchema>;
export type LearningAssessmentType = z.infer<typeof learningAssessmentTypeSchema>;

interface LearningRecord {
  readonly id: string;
  readonly userId: UserId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LearningStage extends LearningRecord {
  readonly workContextId: string;
  readonly title: string;
  readonly position: number;
  readonly status: z.infer<typeof learningStageStatusSchema>;
  readonly completionMode: LearningStageCompletionMode;
  readonly transitionMode: LearningStageTransitionMode;
  readonly targetStartDate: string | null;
  readonly targetEndDate: string | null;
  /** Declarative conditions/material membership/thresholds; not evaluated in this contract wave. */
  readonly config: LearningConfig;
}

export interface LearningMaterial extends LearningRecord {
  readonly workContextId: string;
  readonly stageId: string | null;
  readonly title: string;
  /** Open data categories: new textbooks, apps, and material roles need no schema/code changes. */
  readonly materialType: string;
  readonly role: string | null;
  readonly trackingMode: LearningTrackingMode;
  readonly unitType: string | null;
  readonly totalUnits: number | null;
  readonly startUnit: number | null;
  readonly status: z.infer<typeof learningMaterialStatusSchema>;
  readonly sourceReference: LearningConfig | null;
  readonly config: LearningConfig;
}

export interface LearningAllocationPolicy extends LearningRecord {
  readonly workContextId: string;
  readonly stageId: string | null;
  readonly name: string;
  /** Data-defined profiles; no course/certification-specific enum or evaluator. */
  readonly profileType: string;
  readonly activationCondition: LearningConfig;
  readonly recoveryMode: LearningRecoveryMode;
  readonly priority: number;
  readonly active: boolean;
  readonly config: LearningConfig;
}

export interface LearningAllocationItem extends LearningRecord {
  readonly allocationPolicyId: string;
  readonly materialId: string;
  readonly targetUnits: number;
  readonly minimumUnits: number | null;
  readonly estimatedMinutesMin: number | null;
  readonly estimatedMinutesMax: number | null;
  readonly position: number;
  readonly active: boolean;
}

export interface ContextRelation extends LearningRecord {
  readonly fromContextId: string;
  readonly toContextId: string;
  /** Data-defined, e.g. LEARNING_SYNERGY. No topic ontology. */
  readonly relationType: string;
  readonly config: LearningConfig;
  readonly active: boolean;
}

export interface TaskLearningTarget {
  readonly id: string;
  readonly userId: UserId;
  readonly taskId: string;
  readonly targetRole: LearningTargetRole;
  readonly materialId: string | null;
  readonly learningUnitId: string | null;
  readonly startSequence: number | null;
  readonly endSequence: number | null;
  readonly allocationPolicyId: string | null;
  readonly assignedUnits: number | null;
  readonly completedUnits: number;
  readonly completedThroughSequence: number | null;
  readonly executionStatus: LearningTargetExecutionStatus;
  readonly resolvedAt: string | null;
  readonly recoveryMode: LearningRecoveryMode | null;
  readonly materializationKey: string | null;
  readonly createdAt: string;
}

/** Generic learning_assessments view over the existing assessment storage. */
export interface LearningAssessment extends LearningRecord {
  readonly workContextId: string;
  readonly linkedTaskId: string | null;
  readonly assessmentType: LearningAssessmentType;
  readonly title: string;
  readonly weightPercent: number | null;
  /** Authoritative calendar date when no exact time is known. */
  readonly dueDate: string | null;
  /** Exact timestamp only; never synthesized from dueDate. */
  readonly dueAt: string | null;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly submissionStatus: string | null;
  readonly provenance: string;
  readonly observedAt: string;
  /** Runtime-validated structured scope; null means unknown, never inferred. */
  readonly scopeConfig: AssessmentScopeConfig | null;
}
