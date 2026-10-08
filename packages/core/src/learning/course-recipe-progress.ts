import { z } from "zod";
import type { LearningTaskProposal } from "./learning-task-execution.js";
import type { LearningRecoveryMode } from "./learning-v2.js";
import {
  parseLearningScopeKey,
  readCourseRecipeMaterialBinding,
  type CourseRecipeAction,
  type CourseRecipeConfig,
  type LearningScopeIdentity
} from "./course-recipe.js";

export type CourseRecipeExposureState = "NOT_STARTED" | "PARTIAL" | "COMPLETE";
export type CourseRecipeUnderstandingState = "UNKNOWN" | "WEAK" | "OK" | "STRONG";
export type CourseRecipeValidationState = "NOT_TESTED" | "FAILED" | "PASSED";

export interface CourseRecipeMaterialEvidence {
  readonly materialId: string;
  readonly stageId: string | null;
  readonly config: unknown;
}

export interface CourseRecipeUnitEvidence {
  readonly learningUnitId: string;
  readonly materialId: string | null;
  readonly canonicalTopicKey: string | null;
  /** Display evidence only; canonicalTopicKey remains scope identity. */
  readonly scopeLabel?: string | null;
  readonly sequenceNo: number | null;
  readonly exposureState: CourseRecipeExposureState;
  readonly understandingState: CourseRecipeUnderstandingState;
  readonly validationState: CourseRecipeValidationState;
}

export interface CourseRecipeActionCell {
  readonly learningUnitId: string;
  readonly materialId: string;
  readonly actionKey: string;
  readonly label: string;
  readonly phase: CourseRecipeAction["phase"];
  readonly order: number;
  readonly requiredForBaseCompletion: boolean;
  readonly exposure: CourseRecipeExposureState;
  readonly understanding: CourseRecipeUnderstandingState;
  readonly validation: CourseRecipeValidationState;
}

export interface CourseRecipeScopeProjection {
  readonly scopeKey: string;
  readonly scopeLabel: string;
  readonly scopeType: LearningScopeIdentity["scopeType"];
  /** Material-local ordering evidence. It is never interpreted as scope identity. */
  readonly sequence: number;
  readonly actions: readonly CourseRecipeActionCell[];
  readonly baseState: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "UNKNOWN";
}

export type CourseRecipeProjectionResult =
  | { readonly status: "PROJECTED"; readonly scopes: readonly CourseRecipeScopeProjection[] }
  | { readonly status: "UNKNOWN"; readonly scopes: readonly []; readonly reason: string };

const unknownProjection = (reason: string): CourseRecipeProjectionResult => ({ status: "UNKNOWN", scopes: [], reason });

export function projectCourseRecipeScopes(input: {
  readonly recipe: CourseRecipeConfig;
  readonly materials: readonly CourseRecipeMaterialEvidence[];
  readonly units: readonly CourseRecipeUnitEvidence[];
}): CourseRecipeProjectionResult {
  const actions = new Map(input.recipe.actions.map((action) => [action.actionKey, action]));
  const materialByAction = new Map<string, CourseRecipeMaterialEvidence>();
  const actionByMaterial = new Map<string, CourseRecipeAction>();
  for (const material of input.materials) {
    const binding = readCourseRecipeMaterialBinding(material.config);
    if (!binding) continue;
    const action = actions.get(binding.recipeActionKey);
    if (!action || binding.presetId !== input.recipe.presetId || binding.presetVersion !== input.recipe.presetVersion
      || binding.recipePhase !== action.phase) return unknownProjection("INVALID_MATERIAL_RECIPE_BINDING");
    if (materialByAction.has(action.actionKey)) return unknownProjection("DUPLICATE_RECIPE_ACTION_MATERIAL");
    materialByAction.set(action.actionKey, material);
    actionByMaterial.set(material.materialId, action);
  }
  const requiredBase = input.recipe.actions.filter((action) => action.phase === "BASE" && action.requiredForBaseCompletion);
  if (requiredBase.some((action) => !materialByAction.has(action.actionKey))) {
    return unknownProjection("REQUIRED_BASE_ACTION_MATERIAL_MISSING");
  }

  const scopes = new Map<string, {
    identity: LearningScopeIdentity;
    label: string;
    sequence: number;
    cells: CourseRecipeActionCell[];
    actionKeys: Set<string>;
  }>();
  for (const unit of input.units) {
    if (!unit.materialId) continue;
    const action = actionByMaterial.get(unit.materialId);
    if (!action) continue;
    const identity = parseLearningScopeKey(unit.canonicalTopicKey);
    if (!identity || identity.scopeType !== action.scopeType || unit.sequenceNo === null) {
      return unknownProjection("INVALID_SCOPE_IDENTITY");
    }
    const existing = scopes.get(identity.key);
    if (existing && existing.sequence !== unit.sequenceNo) return unknownProjection("INCONSISTENT_SCOPE_SEQUENCE");
    const scope = existing ?? {
      identity,
      label: unit.scopeLabel?.trim() || identity.label,
      sequence: unit.sequenceNo,
      cells: [],
      actionKeys: new Set<string>()
    };
    if (scope.actionKeys.has(action.actionKey)) return unknownProjection("DUPLICATE_SCOPE_ACTION_CELL");
    scope.actionKeys.add(action.actionKey);
    scope.cells.push({
      learningUnitId: unit.learningUnitId,
      materialId: unit.materialId,
      actionKey: action.actionKey,
      label: action.label,
      phase: action.phase,
      order: action.order,
      requiredForBaseCompletion: action.requiredForBaseCompletion,
      exposure: unit.exposureState,
      understanding: unit.understandingState,
      validation: unit.validationState
    });
    scopes.set(identity.key, scope);
  }

  const projected = [...scopes.values()].sort((left, right) => left.sequence - right.sequence || left.identity.key.localeCompare(right.identity.key))
    .map<CourseRecipeScopeProjection>((scope) => {
      const baseCells = requiredBase.map((action) => scope.cells.find((cell) => cell.actionKey === action.actionKey) ?? null);
      const baseState = baseCells.some((cell) => cell === null) ? "UNKNOWN" as const
        : baseCells.every((cell) => cell!.exposure === "COMPLETE") ? "COMPLETE" as const
          : baseCells.some((cell) => cell!.exposure !== "NOT_STARTED") ? "IN_PROGRESS" as const
            : "NOT_STARTED" as const;
      return {
        scopeKey: scope.identity.key,
        scopeLabel: scope.label,
        scopeType: scope.identity.scopeType,
        sequence: scope.sequence,
        actions: [...scope.cells].sort((left, right) => left.order - right.order),
        baseState
      };
    });
  return projected.length ? { status: "PROJECTED", scopes: projected } : unknownProjection("NO_RECIPE_SCOPES");
}

export interface ActiveCourseRecipeTask {
  readonly materializationKey: string | null;
}

export type NextCourseRecipeCellResult =
  | { readonly status: "SELECTED"; readonly scope: CourseRecipeScopeProjection; readonly cell: CourseRecipeActionCell }
  | { readonly status: "NONE"; readonly reason: "ACTIVE_AUTO_TASK" | "ALL_BASE_COMPLETE" }
  | { readonly status: "UNKNOWN"; readonly reason: string };

export function selectNextCourseRecipeCell(input: {
  readonly recipe: CourseRecipeConfig;
  readonly projection: CourseRecipeProjectionResult;
  readonly activeTasks: readonly ActiveCourseRecipeTask[];
}): NextCourseRecipeCellResult {
  if (input.activeTasks.some((task) => task.materializationKey?.startsWith("learning:auto:")
    || task.materializationKey?.startsWith("learning:"))) {
    return { status: "NONE", reason: "ACTIVE_AUTO_TASK" };
  }
  if (input.projection.status !== "PROJECTED") return { status: "UNKNOWN", reason: input.projection.reason };
  const baseActions = input.recipe.actions
    .filter((action) => action.phase === "BASE" && action.requiredForBaseCompletion)
    .sort((left, right) => left.order - right.order);
  for (const scope of input.projection.scopes) {
    if (scope.baseState === "UNKNOWN") return { status: "UNKNOWN", reason: "INCOMPLETE_BASE_SCOPE_EVIDENCE" };
    for (const action of baseActions) {
      const cell = scope.actions.find((candidate) => candidate.actionKey === action.actionKey);
      if (!cell) return { status: "UNKNOWN", reason: "INCOMPLETE_BASE_SCOPE_EVIDENCE" };
      if (cell.exposure !== "COMPLETE") return { status: "SELECTED", scope, cell };
    }
  }
  return { status: "NONE", reason: "ALL_BASE_COMPLETE" };
}

export function buildCourseRecipeLearningTaskProposal(input: {
  readonly workContextId: string;
  readonly courseTitle: string;
  readonly stageId: string;
  readonly planDate: string;
  readonly importance: number;
  readonly selection: Extract<NextCourseRecipeCellResult, { readonly status: "SELECTED" }>;
  readonly allocationPolicyId: string | null;
  readonly allocationPolicyName: string | null;
  readonly estimatedMinutes: number | null;
  readonly recoveryMode: LearningRecoveryMode;
}): LearningTaskProposal {
  z.iso.date().parse(input.planDate);
  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5) {
    throw new Error("Invalid Task importance");
  }
  const { scope, cell } = input.selection;
  return {
    materializationKey: `learning:auto:course-recipe:${input.workContextId}:${scope.scopeKey}:${cell.actionKey}`,
    workContextId: input.workContextId,
    stageId: input.stageId,
    materialId: cell.materialId,
    allocationPolicyId: input.allocationPolicyId,
    allocationPolicyName: input.allocationPolicyName,
    planDate: input.planDate,
    importance: input.importance,
    title: `${input.courseTitle} ${scope.scopeLabel} ${cell.label}`,
    completionCriteria: `${scope.scopeLabel} ${cell.label} 완료`,
    assignedUnits: 1,
    estimatedMinutes: input.estimatedMinutes,
    startSequence: scope.sequence,
    endSequence: scope.sequence,
    learningUnitIds: [cell.learningUnitId],
    recoveryMode: input.recoveryMode,
    source: input.allocationPolicyId ? "PERSISTED_POLICY" : "DEFAULT",
    reasons: [{ code: "NEXT_COURSE_RECIPE_CELL", evidence: {
      scopeKey: scope.scopeKey,
      actionKey: cell.actionKey,
      scopeSequence: scope.sequence,
      recipeActionOrder: cell.order
    } }]
  };
}
