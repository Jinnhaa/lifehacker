import { z } from "zod";
import { resolveLearningAllocation, type AllocationMaterialState, type ResolveLearningAllocationInput } from "./learning-allocation.js";
import type { LearningStageCompletionMode } from "./learning-v2.js";

export interface LearningForecastDay {
  readonly date: string;
  readonly eligible: boolean;
  /** Explicit unit capacity by material. Missing means the resolved policy target is usable. */
  readonly materialUnitCapacity?: Readonly<Record<string, number | null>>;
  readonly availableMinutes?: number | null;
  readonly reductionRequested?: boolean;
}

export interface MaterialForecastResult {
  readonly materialId: string;
  readonly status: "PROJECTED" | "ALREADY_COMPLETE" | "UNKNOWN" | "BEYOND_HORIZON";
  readonly projectedCompletionDate: string | null;
  readonly remainingUnitsAtHorizon: number | null;
  readonly eligibleDatesUsed: readonly string[];
  readonly reasons: readonly ForecastReason[];
}

export interface ForecastReason {
  readonly code: string;
  readonly evidence: Readonly<Record<string, string | number | boolean | null>>;
}

const validDate = (date: string): void => { z.iso.date().parse(date); };
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);
const orderedDays = (days: readonly LearningForecastDay[]): readonly LearningForecastDay[] => {
  const dates = new Set<string>();
  for (const day of days) {
    validDate(day.date);
    if (dates.has(day.date)) throw new Error(`Duplicate forecast date: ${day.date}`);
    dates.add(day.date);
    for (const capacity of Object.values(day.materialUnitCapacity ?? {})) {
      if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) throw new Error("Invalid material unit capacity");
    }
  }
  return [...days].sort((left, right) => left.date.localeCompare(right.date));
};

export function projectMaterialCompletion(input: {
  readonly materialId: string;
  readonly remainingUnits: number | null;
  readonly days: readonly LearningForecastDay[];
}): MaterialForecastResult {
  if (input.remainingUnits === null) return { materialId: input.materialId, status: "UNKNOWN", projectedCompletionDate: null,
    remainingUnitsAtHorizon: null, eligibleDatesUsed: [], reasons: [{ code: "REMAINING_WORKLOAD_UNKNOWN", evidence: {} }] };
  if (!Number.isFinite(input.remainingUnits) || input.remainingUnits < 0) throw new Error("Invalid remaining workload");
  if (input.remainingUnits === 0) return { materialId: input.materialId, status: "ALREADY_COMPLETE", projectedCompletionDate: null,
    remainingUnitsAtHorizon: 0, eligibleDatesUsed: [], reasons: [{ code: "NO_REMAINING_WORKLOAD", evidence: {} }] };
  let remaining = input.remainingUnits;
  const used: string[] = [];
  for (const day of orderedDays(input.days)) {
    if (!day.eligible) continue;
    const capacity = day.materialUnitCapacity?.[input.materialId];
    if (capacity === undefined || capacity === null) return { materialId: input.materialId, status: "UNKNOWN",
      projectedCompletionDate: null, remainingUnitsAtHorizon: remaining, eligibleDatesUsed: used,
      reasons: [{ code: "DAILY_UNIT_CAPACITY_UNKNOWN", evidence: { date: day.date } }] };
    if (capacity === 0) continue;
    used.push(day.date);
    remaining = Math.max(0, remaining - capacity);
    if (remaining === 0) return { materialId: input.materialId, status: "PROJECTED", projectedCompletionDate: day.date,
      remainingUnitsAtHorizon: 0, eligibleDatesUsed: used,
      reasons: [{ code: "BOUNDED_WORKLOAD_PROJECTED", evidence: { initialRemainingUnits: input.remainingUnits, eligibleDaysUsed: used.length } }] };
  }
  return { materialId: input.materialId, status: "BEYOND_HORIZON", projectedCompletionDate: null,
    remainingUnitsAtHorizon: remaining, eligibleDatesUsed: used,
    reasons: [{ code: "FORECAST_HORIZON_EXHAUSTED", evidence: { remainingUnits: remaining } }] };
}

export interface BoundedStageMaterial {
  readonly materialId: string;
  readonly key: string | null;
  readonly stageId: string;
  readonly status: string;
  readonly remainingUnits: number | null;
  readonly requiredForCompletion: boolean;
}

export interface BoundedStageForecastInput {
  readonly stageId: string;
  readonly stageKey: string | null;
  readonly stageStatus: string;
  readonly completionMode: LearningStageCompletionMode;
  readonly asOfDate: string;
  readonly targetDate: string | null;
  readonly materials: readonly BoundedStageMaterial[];
  readonly policies: ResolveLearningAllocationInput["policies"];
  readonly allocationItems: ResolveLearningAllocationInput["items"];
  readonly days: readonly LearningForecastDay[];
}

export interface StageForecastResult {
  readonly stageId: string;
  readonly status: "PROJECTED" | "ALREADY_COMPLETE" | "UNKNOWN" | "BEYOND_HORIZON";
  readonly projectedCompletionDate: string | null;
  readonly projectedNextStageStartDate: string | null;
  readonly scheduleSlackDays: number | null;
  readonly remainingWorkload: Readonly<Record<string, number | null>>;
  readonly eligibleDatesUsed: readonly string[];
  readonly selectedPolicyIds: readonly string[];
  readonly reasons: readonly ForecastReason[];
}

export function projectBoundedStageCompletion(input: BoundedStageForecastInput): StageForecastResult {
  validDate(input.asOfDate);
  if (input.targetDate) validDate(input.targetDate);
  const days = orderedDays(input.days).filter((day) => day.date > input.asOfDate);
  const required = input.materials.filter((material) => material.requiredForCompletion);
  const remaining = new Map(input.materials.map((material) => [material.materialId, material.remainingUnits]));
  if (remaining.size !== input.materials.length) throw new Error("Duplicate forecast material");
  for (const value of remaining.values()) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Invalid remaining material workload");
  }
  const snapshot = (): Readonly<Record<string, number | null>> => Object.fromEntries(remaining);
  if (input.stageStatus === "COMPLETED") return {
    stageId: input.stageId, status: "ALREADY_COMPLETE", projectedCompletionDate: input.asOfDate,
    projectedNextStageStartDate: days.find((day) => day.eligible)?.date ?? null,
    scheduleSlackDays: input.targetDate ? daysBetween(input.asOfDate, input.targetDate) : null,
    remainingWorkload: snapshot(), eligibleDatesUsed: [], selectedPolicyIds: [],
    reasons: [{ code: "STAGE_EXPLICITLY_COMPLETE", evidence: {} }]
  };
  if (input.completionMode !== "ALL_REQUIRED_MATERIALS") return unknownStage(input, snapshot(),
    input.completionMode === "ASSESSMENT_THRESHOLD" ? "ASSESSMENT_OUTCOME_CANNOT_BE_FORECAST" : "MANUAL_COMPLETION_CANNOT_BE_FORECAST");
  if (required.length === 0 || required.some((material) => material.remainingUnits === null)) {
    return unknownStage(input, snapshot(), required.length === 0 ? "REQUIRED_MATERIALS_UNDEFINED" : "REQUIRED_WORKLOAD_UNKNOWN");
  }
  if (required.every((material) => material.remainingUnits === 0)) return {
    stageId: input.stageId, status: "ALREADY_COMPLETE", projectedCompletionDate: input.asOfDate,
    projectedNextStageStartDate: days.find((day) => day.eligible)?.date ?? null,
    scheduleSlackDays: input.targetDate ? daysBetween(input.asOfDate, input.targetDate) : null,
    remainingWorkload: snapshot(), eligibleDatesUsed: [], selectedPolicyIds: [],
    reasons: [{ code: "REQUIRED_WORKLOAD_ALREADY_COMPLETE", evidence: { requiredMaterials: required.length } }]
  };

  const used: string[] = [];
  const policyIds = new Set<string>();
  for (const day of days) {
    if (!day.eligible) continue;
    const materialStates: AllocationMaterialState[] = input.materials.map((material) => ({
      materialId: material.materialId,
      key: material.key,
      stageId: material.stageId,
      status: remaining.get(material.materialId) === 0 ? "COMPLETED" : material.status
    }));
    const resolution = resolveLearningAllocation({
      activeStageId: input.stageId,
      stages: [{ stageId: input.stageId, key: input.stageKey, status: "ACTIVE" }],
      materials: materialStates,
      policies: input.policies,
      items: input.allocationItems,
      capacity: day.availableMinutes === undefined && day.reductionRequested !== true ? null : {
        availableMinutes: day.availableMinutes ?? null,
        reductionRequested: day.reductionRequested === true
      },
      todayOverride: null,
      fallbackItems: []
    });
    if (resolution.status !== "RESOLVED") return unknownStage(input, snapshot(), "DAILY_ALLOCATION_UNRESOLVED", used, [...policyIds], day.date);
    if (resolution.selectedPolicyId) policyIds.add(resolution.selectedPolicyId);
    let allocated = false;
    for (const item of resolution.items) {
      const before = remaining.get(item.materialId);
      if (before === undefined || before === null || before === 0 || item.resolvedUnits === null) continue;
      const explicitCapacity = day.materialUnitCapacity?.[item.materialId];
      if (explicitCapacity === null) return unknownStage(input, snapshot(), "DAILY_UNIT_CAPACITY_UNKNOWN", used, [...policyIds], day.date);
      const units = explicitCapacity === undefined ? item.resolvedUnits : Math.min(item.resolvedUnits, explicitCapacity);
      if (units > 0) allocated = true;
      remaining.set(item.materialId, Math.max(0, before - units));
    }
    if (allocated) used.push(day.date);
    if (required.every((material) => remaining.get(material.materialId) === 0)) {
      const next = days.find((candidate) => candidate.eligible && candidate.date > day.date)?.date ?? null;
      return {
        stageId: input.stageId,
        status: "PROJECTED",
        projectedCompletionDate: day.date,
        projectedNextStageStartDate: next,
        scheduleSlackDays: input.targetDate ? daysBetween(day.date, input.targetDate) : null,
        remainingWorkload: snapshot(),
        eligibleDatesUsed: used,
        selectedPolicyIds: [...policyIds],
        reasons: [{ code: "REQUIRED_WORKLOAD_REPROJECTED", evidence: { requiredMaterials: required.length, eligibleDaysUsed: used.length } }]
      };
    }
  }
  return {
    stageId: input.stageId, status: "BEYOND_HORIZON", projectedCompletionDate: null, projectedNextStageStartDate: null,
    scheduleSlackDays: null, remainingWorkload: snapshot(), eligibleDatesUsed: used, selectedPolicyIds: [...policyIds],
    reasons: [{ code: "FORECAST_HORIZON_EXHAUSTED", evidence: { eligibleDaysUsed: used.length } }]
  };
}

function unknownStage(
  input: BoundedStageForecastInput,
  remainingWorkload: Readonly<Record<string, number | null>>,
  code: string,
  eligibleDatesUsed: readonly string[] = [],
  selectedPolicyIds: readonly string[] = [],
  date: string | null = null
): StageForecastResult {
  return { stageId: input.stageId, status: "UNKNOWN", projectedCompletionDate: null, projectedNextStageStartDate: null,
    scheduleSlackDays: null, remainingWorkload, eligibleDatesUsed, selectedPolicyIds,
    reasons: [{ code, evidence: { date } }] };
}

export interface LearningProgramForecast {
  readonly stages: readonly StageForecastResult[];
  readonly lastDefensibleStageId: string | null;
  readonly projectedProgramCompletionDate: string | null;
  readonly reasons: readonly ForecastReason[];
}

export function projectLearningProgram(stages: readonly BoundedStageForecastInput[]): LearningProgramForecast {
  if (stages.length === 0) return { stages: [], lastDefensibleStageId: null, projectedProgramCompletionDate: null,
    reasons: [{ code: "PROGRAM_STAGES_UNAVAILABLE", evidence: { stageCount: 0 } }] };
  const results: StageForecastResult[] = [];
  let afterDate: string | null = null;
  for (const stage of stages) {
    const result = projectBoundedStageCompletion({ ...stage,
      asOfDate: afterDate ?? stage.asOfDate,
      days: afterDate === null ? stage.days : stage.days.filter((day) => day.date > afterDate!) });
    results.push(result);
    if (result.projectedCompletionDate === null) break;
    afterDate = result.projectedCompletionDate;
  }
  const allProjected = results.length === stages.length && results.every((result) => result.projectedCompletionDate !== null);
  return {
    stages: results,
    lastDefensibleStageId: [...results].reverse().find((result) => result.projectedCompletionDate !== null)?.stageId ?? null,
    projectedProgramCompletionDate: allProjected ? results.at(-1)?.projectedCompletionDate ?? null : null,
    reasons: allProjected ? [{ code: "ALL_STAGE_WORKLOAD_DEFENSIBLE", evidence: { stageCount: stages.length } }]
      : [{ code: "PROGRAM_COMPLETION_UNKNOWN_AFTER_LAST_DEFENSIBLE_STAGE", evidence: { projectedStages: results.filter((item) => item.projectedCompletionDate !== null).length } }]
  };
}

export interface MissedDayImpact {
  readonly baseline: StageForecastResult;
  readonly reprojected: StageForecastResult;
  readonly completionDelayDays: number | null;
  readonly reasons: readonly ForecastReason[];
}

/** Reprojects all remaining work; it never assumes one missed date equals one day of delay. */
export function projectMissedLearningDayImpact(input: BoundedStageForecastInput, missedDate: string): MissedDayImpact {
  validDate(missedDate);
  const baseline = projectBoundedStageCompletion(input);
  const reprojected = projectBoundedStageCompletion({ ...input,
    days: input.days.map((day) => day.date === missedDate ? { ...day, eligible: false } : day) });
  const delay = baseline.projectedCompletionDate !== null && reprojected.projectedCompletionDate !== null
    ? daysBetween(baseline.projectedCompletionDate, reprojected.projectedCompletionDate) : null;
  return { baseline, reprojected, completionDelayDays: delay,
    reasons: [{ code: delay === null ? "DELAY_IMPACT_UNKNOWN" : "WORKLOAD_REPROJECTED_AFTER_MISSED_DAY",
      evidence: { missedDate, completionDelayDays: delay } }] };
}
