import { z } from "zod";
import {
  learningAssessmentTypeSchema,
  learningRecoveryModeSchema,
  learningStageCompletionModeSchema,
  learningStageTransitionModeSchema,
  learningTrackingModeSchema
} from "./learning-v2.js";

const dateSchema = z.iso.date();
const timestampSchema = z.iso.datetime({ offset: true });
const configSchema = z.record(z.string(), z.unknown());

const assessmentSchema = z.object({
  type: learningAssessmentTypeSchema,
  title: z.string().min(1),
  weightPercent: z.number().min(0).max(100).nullable(),
  dueDate: dateSchema.nullable(),
  dueAt: timestampSchema.nullable(),
  provenance: z.string().min(1)
}).superRefine((assessment, context) => {
  if (assessment.dueDate !== null && assessment.dueAt !== null) {
    context.addIssue({ code: "custom", message: "Assessment dueDate and dueAt are mutually exclusive" });
  }
});

const stageSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  position: z.number().int().positive(),
  status: z.enum(["NOT_STARTED", "ACTIVE", "COMPLETED", "ARCHIVED"]),
  completionMode: learningStageCompletionModeSchema,
  transitionMode: learningStageTransitionModeSchema,
  config: configSchema
});

const materialSchema = z.object({
  key: z.string().min(1),
  stageKey: z.string().min(1).nullable(),
  title: z.string().min(1),
  materialType: z.string().min(1),
  role: z.string().min(1).nullable(),
  trackingMode: learningTrackingModeSchema,
  unitType: z.string().min(1).nullable(),
  totalUnits: z.number().positive().nullable(),
  startUnit: z.number().positive().nullable(),
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]),
  sourceReference: configSchema.nullable(),
  config: configSchema,
  generateUnits: z.object({ from: z.number().int().positive(), to: z.number().int().positive(), titlePrefix: z.string() }).nullable()
});

const policySchema = z.object({
  name: z.string().min(1),
  stageKey: z.string().min(1).nullable(),
  profileType: z.string().min(1),
  activationCondition: configSchema,
  recoveryMode: learningRecoveryModeSchema,
  priority: z.number().int().nonnegative(),
  config: configSchema,
  items: z.array(z.object({
    materialKey: z.string().min(1),
    targetUnits: z.number().positive(),
    minimumUnits: z.number().nonnegative().nullable(),
    estimatedMinutesMin: z.number().int().nonnegative().nullable(),
    estimatedMinutesMax: z.number().int().nonnegative().nullable(),
    position: z.number().int().positive()
  }))
});

const contextSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(["course", "certification"]),
  title: z.string().min(1),
  commitmentLevel: z.enum(["REQUIRED", "IMPORTANT", "OPTIONAL"]).nullable(),
  strategyConfig: configSchema,
  courseProfile: z.object({ term: z.string().min(1), targetGrade: z.string().min(1) }).nullable(),
  certificationProfile: z.object({
    targetOutcome: z.string().min(1).nullable(),
    examDate: dateSchema.nullable(),
    studyMode: z.enum(["CUMULATIVE", "MIXED", "CRAMMABLE"]).nullable(),
    currentLevel: z.string().min(1).nullable()
  }).nullable(),
  stages: z.array(stageSchema),
  materials: z.array(materialSchema),
  allocationPolicies: z.array(policySchema),
  assessments: z.array(assessmentSchema)
}).superRefine((item, context) => {
  if ((item.kind === "course") !== (item.courseProfile !== null)) {
    context.addIssue({ code: "custom", message: "Course contexts require only a courseProfile" });
  }
  if ((item.kind === "certification") !== (item.certificationProfile !== null)) {
    context.addIssue({ code: "custom", message: "Certification contexts require only a certificationProfile" });
  }
});

export const learningBootstrapSchema = z.object({
  name: z.string().min(1),
  contexts: z.array(contextSchema),
  relations: z.array(z.object({
    fromContextKey: z.string().min(1),
    toContextKey: z.string().min(1),
    relationType: z.string().min(1),
    config: configSchema
  }))
});

export type LearningBootstrap = z.infer<typeof learningBootstrapSchema>;

export interface LearningBootstrapResult {
  readonly contexts: number;
  readonly stages: number;
  readonly materials: number;
  readonly units: number;
  readonly allocationPolicies: number;
  readonly assessments: number;
  readonly relations: number;
}
