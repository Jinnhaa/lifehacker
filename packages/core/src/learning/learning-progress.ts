import type { LearningStageCompletionMode } from "./learning-v2.js";

export type DerivedLearningState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export interface LearningUnitProgressEvidence {
  readonly unitId: string;
  readonly sequenceNo: number | null;
  /** Explicit workload completion; independent of the three learning-state dimensions. */
  readonly workloadCompleted: boolean;
  readonly exposureState: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  readonly understandingState: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  readonly validationState: "NOT_TESTED" | "FAILED" | "PASSED";
}

export interface MaterialProgressInput {
  readonly materialId: string;
  readonly unitType: string | null;
  readonly explicitStatus: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  /** Trustworthy total when the material starts at its first unit. */
  readonly totalUnits: number | null;
  /** Explicit inclusive range takes precedence over totalUnits. */
  readonly scopedRange: { readonly startSequence: number; readonly endSequence: number } | null;
  readonly units: readonly LearningUnitProgressEvidence[];
}

export interface MaterialProgress {
  readonly materialId: string;
  readonly state: DerivedLearningState;
  readonly denominatorSource: "SCOPED_RANGE" | "TOTAL_UNITS" | "UNAVAILABLE";
  readonly totalScopedUnits: number | null;
  readonly completedUnits: number;
  readonly remainingUnits: number | null;
  readonly progressRatio: number | null;
  readonly progressPercent: number | null;
  readonly exposure: Readonly<Record<LearningUnitProgressEvidence["exposureState"], number>>;
  readonly understanding: Readonly<Record<LearningUnitProgressEvidence["understandingState"], number>>;
  readonly validation: Readonly<Record<LearningUnitProgressEvidence["validationState"], number>>;
  readonly reasons: readonly ProgressReason[];
}

export interface ProgressReason {
  readonly code: string;
  readonly evidence: Readonly<Record<string, string | number | boolean | null>>;
}

const finiteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;
const percentage = (completed: number, total: number): number => Math.min(100, completed / total * 100);

export function deriveMaterialProgress(input: MaterialProgressInput): MaterialProgress {
  const seen = new Set<string>();
  for (const unit of input.units) {
    if (seen.has(unit.unitId)) throw new Error(`Duplicate Learning Unit evidence: ${unit.unitId}`);
    seen.add(unit.unitId);
  }
  let denominatorSource: MaterialProgress["denominatorSource"] = "UNAVAILABLE";
  let totalScopedUnits: number | null = null;
  let relevantUnits = input.units;
  if (input.scopedRange) {
    const { startSequence, endSequence } = input.scopedRange;
    if (!Number.isInteger(startSequence) || !Number.isInteger(endSequence) || startSequence <= 0 || endSequence < startSequence) {
      throw new Error("Invalid scoped material range");
    }
    denominatorSource = "SCOPED_RANGE";
    totalScopedUnits = endSequence - startSequence + 1;
    relevantUnits = input.units.filter((unit) => unit.sequenceNo !== null
      && unit.sequenceNo >= startSequence && unit.sequenceNo <= endSequence);
  } else if (input.totalUnits !== null) {
    if (!finiteNonNegative(input.totalUnits) || input.totalUnits === 0) throw new Error("Material totalUnits must be positive");
    denominatorSource = "TOTAL_UNITS";
    totalScopedUnits = input.totalUnits;
  }
  const sequences = new Set<number>();
  for (const unit of relevantUnits) {
    if (unit.sequenceNo === null) continue;
    if (sequences.has(unit.sequenceNo)) throw new Error(`Duplicate material sequence evidence: ${unit.sequenceNo}`);
    sequences.add(unit.sequenceNo);
  }
  const completedUnits = relevantUnits.filter((unit) => unit.workloadCompleted).length;
  const activityObserved = relevantUnits.some((unit) => unit.workloadCompleted
    || unit.exposureState !== "NOT_STARTED" || unit.understandingState !== "UNKNOWN" || unit.validationState !== "NOT_TESTED");
  const remainingUnits = totalScopedUnits === null ? null : Math.max(0, totalScopedUnits - completedUnits);
  const ratio = totalScopedUnits === null ? null : Math.min(1, completedUnits / totalScopedUnits);
  const state: DerivedLearningState = input.explicitStatus === "COMPLETED" || (remainingUnits === 0 && totalScopedUnits !== null)
    ? "COMPLETE" : activityObserved ? "IN_PROGRESS" : "NOT_STARTED";
  const count = <T extends string>(values: readonly T[], options: readonly T[]): Readonly<Record<T, number>> =>
    Object.fromEntries(options.map((option) => [option, values.filter((value) => value === option).length])) as Record<T, number>;
  return {
    materialId: input.materialId,
    state,
    denominatorSource,
    totalScopedUnits,
    completedUnits,
    remainingUnits,
    progressRatio: ratio,
    progressPercent: ratio === null ? null : percentage(completedUnits, totalScopedUnits!),
    exposure: count(relevantUnits.map((unit) => unit.exposureState), ["NOT_STARTED", "PARTIAL", "COMPLETE"]),
    understanding: count(relevantUnits.map((unit) => unit.understandingState), ["UNKNOWN", "WEAK", "OK", "STRONG"]),
    validation: count(relevantUnits.map((unit) => unit.validationState), ["NOT_TESTED", "FAILED", "PASSED"]),
    reasons: totalScopedUnits === null
      ? [{ code: "DENOMINATOR_UNAVAILABLE", evidence: { observedCompletedUnits: completedUnits } }]
      : [{ code: denominatorSource, evidence: { totalScopedUnits, completedUnits } }]
  };
}

export interface StageProgressInput {
  readonly stageId: string;
  readonly explicitStatus: "NOT_STARTED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  readonly completionMode: LearningStageCompletionMode;
  readonly requiredMaterialIds: readonly string[] | null;
  readonly materials: readonly (MaterialProgress & { readonly unitType: string | null })[];
  readonly assessmentThreshold: {
    readonly targetValue: number;
    readonly currentValue: number | null;
    readonly explicitlyPassed: boolean;
  } | null;
}

export interface StageProgress {
  readonly stageId: string;
  readonly state: DerivedLearningState;
  readonly completionDefensible: boolean;
  readonly workloadProgressPercent: number | null;
  readonly materials: readonly MaterialProgress[];
  readonly reasons: readonly ProgressReason[];
}

export function deriveStageProgress(input: StageProgressInput): StageProgress {
  if (new Set(input.requiredMaterialIds ?? []).size !== (input.requiredMaterialIds ?? []).length) {
    throw new Error("Duplicate required material id");
  }
  const byId = new Map(input.materials.map((material) => [material.materialId, material]));
  if (byId.size !== input.materials.length) throw new Error("Duplicate material progress evidence");
  const required = input.requiredMaterialIds?.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []) ?? [];
  const missingRequired = input.requiredMaterialIds?.filter((id) => !byId.has(id)) ?? [];
  const activityObserved = input.materials.some((material) => material.state !== "NOT_STARTED");
  let complete = input.explicitStatus === "COMPLETED";
  let completionDefensible = complete;
  const reasons: ProgressReason[] = [];

  if (input.completionMode === "ALL_REQUIRED_MATERIALS") {
    completionDefensible = input.requiredMaterialIds !== null && input.requiredMaterialIds.length > 0 && missingRequired.length === 0;
    complete = completionDefensible && required.every((material) => material.state === "COMPLETE");
    reasons.push({ code: completionDefensible ? "REQUIRED_MATERIALS_EVALUATED" : "REQUIRED_MATERIAL_EVIDENCE_MISSING",
      evidence: { requiredCount: input.requiredMaterialIds?.length ?? 0, missingCount: missingRequired.length } });
  } else if (input.completionMode === "ASSESSMENT_THRESHOLD") {
    const threshold = input.assessmentThreshold;
    if (threshold?.currentValue !== null && threshold?.currentValue !== undefined
      && (!Number.isFinite(threshold.currentValue) || threshold.currentValue < 0)) throw new Error("Invalid assessment current value");
    completionDefensible = threshold !== null && Number.isFinite(threshold.targetValue) && threshold.targetValue > 0;
    complete = completionDefensible && (threshold!.explicitlyPassed
      || (threshold!.currentValue !== null && threshold!.currentValue >= threshold!.targetValue));
    reasons.push({ code: completionDefensible ? "ASSESSMENT_THRESHOLD_EVALUATED" : "ASSESSMENT_THRESHOLD_EVIDENCE_MISSING",
      evidence: { targetValue: threshold?.targetValue ?? null, currentValue: threshold?.currentValue ?? null } });
  } else {
    reasons.push({ code: "MANUAL_COMPLETION", evidence: { explicitlyCompleted: complete } });
  }

  const aggregate = required.length > 0 ? required : input.materials;
  const sharedUnitType = new Set(aggregate.map((material) => material.unitType).filter((value): value is string => value !== null));
  const canAggregate = aggregate.length > 0 && sharedUnitType.size === 1
    && aggregate.every((material) => material.totalScopedUnits !== null);
  const total = canAggregate ? aggregate.reduce((sum, material) => sum + material.totalScopedUnits!, 0) : null;
  const completed = canAggregate ? aggregate.reduce((sum, material) => sum + Math.min(material.completedUnits, material.totalScopedUnits!), 0) : null;
  if (!canAggregate) reasons.push({ code: "AGGREGATE_PERCENTAGE_UNAVAILABLE", evidence: { materialCount: aggregate.length } });
  return {
    stageId: input.stageId,
    state: complete ? "COMPLETE" : input.explicitStatus === "ACTIVE" || activityObserved ? "IN_PROGRESS" : "NOT_STARTED",
    completionDefensible,
    workloadProgressPercent: total === null || completed === null ? null : percentage(completed, total),
    materials: input.materials,
    reasons
  };
}
