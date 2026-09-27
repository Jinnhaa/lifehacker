import type { LearningAllocationItem, LearningAllocationPolicy, LearningRecoveryMode } from "./learning-v2.js";

export interface AllocationMaterialState {
  readonly materialId: string;
  readonly key: string | null;
  readonly stageId: string | null;
  readonly status: string;
}

export interface AllocationStageState {
  readonly stageId: string;
  readonly key: string | null;
  readonly status: string;
}

export type ConditionOutcome = "MATCH" | "NO_MATCH" | "INSUFFICIENT_EVIDENCE" | "UNSUPPORTED";
export interface ConditionEvaluation {
  readonly outcome: ConditionOutcome;
  readonly reasons: readonly { readonly code: string; readonly path: string; readonly actual?: string; readonly expected?: string }[];
}

type UnknownRecord = Readonly<Record<string, unknown>>;
const record = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

export function evaluateLearningActivationCondition(
  condition: unknown,
  evidence: { readonly materials: readonly AllocationMaterialState[]; readonly stages: readonly AllocationStageState[] },
  path = "$"
): ConditionEvaluation {
  if (!record(condition)) return { outcome: "UNSUPPORTED", reasons: [{ code: "CONDITION_NOT_OBJECT", path }] };
  const keys = Object.keys(condition);
  if (keys.length === 0) return { outcome: "MATCH", reasons: [{ code: "UNCONDITIONAL", path }] };
  if (keys.length === 1 && (keys[0] === "all" || keys[0] === "any")) {
    const operator = keys[0]!;
    const children = condition[operator];
    if (!Array.isArray(children) || children.length === 0) {
      return { outcome: "UNSUPPORTED", reasons: [{ code: "INVALID_COMPOSITION", path }] };
    }
    const evaluated = children.map((child, index) => evaluateLearningActivationCondition(child, evidence, `${path}.${operator}[${index}]`));
    const reasons = evaluated.flatMap((item) => item.reasons);
    if (operator === "all") {
      if (evaluated.some((item) => item.outcome === "NO_MATCH")) return { outcome: "NO_MATCH", reasons };
      if (evaluated.some((item) => item.outcome === "UNSUPPORTED")) return { outcome: "UNSUPPORTED", reasons };
      if (evaluated.some((item) => item.outcome === "INSUFFICIENT_EVIDENCE")) return { outcome: "INSUFFICIENT_EVIDENCE", reasons };
      return { outcome: "MATCH", reasons };
    }
    if (evaluated.some((item) => item.outcome === "MATCH")) return { outcome: "MATCH", reasons };
    if (evaluated.some((item) => item.outcome === "UNSUPPORTED")) return { outcome: "UNSUPPORTED", reasons };
    if (evaluated.some((item) => item.outcome === "INSUFFICIENT_EVIDENCE")) return { outcome: "INSUFFICIENT_EVIDENCE", reasons };
    return { outcome: "NO_MATCH", reasons };
  }
  const status = condition.status;
  if (typeof status !== "string") return { outcome: "UNSUPPORTED", reasons: [{ code: "STATUS_EQUALITY_REQUIRED", path }] };
  const materialId = condition.materialId;
  const materialKey = condition.materialKey;
  const stageId = condition.stageId;
  const stageKey = condition.stageKey;
  if ((typeof materialId === "string" || typeof materialKey === "string") && keys.every((key) => ["materialId", "materialKey", "status"].includes(key))) {
    const matches = evidence.materials.filter((item) => typeof materialId === "string" ? item.materialId === materialId : item.key === materialKey);
    if (matches.length !== 1) return { outcome: "INSUFFICIENT_EVIDENCE", reasons: [{ code: "MATERIAL_STATE_NOT_UNIQUE", path }] };
    return { outcome: matches[0]!.status === status ? "MATCH" : "NO_MATCH",
      reasons: [{ code: "MATERIAL_STATUS_EQUALITY", path, actual: matches[0]!.status, expected: status }] };
  }
  if ((typeof stageId === "string" || typeof stageKey === "string") && keys.every((key) => ["stageId", "stageKey", "status"].includes(key))) {
    const matches = evidence.stages.filter((item) => typeof stageId === "string" ? item.stageId === stageId : item.key === stageKey);
    if (matches.length !== 1) return { outcome: "INSUFFICIENT_EVIDENCE", reasons: [{ code: "STAGE_STATE_NOT_UNIQUE", path }] };
    return { outcome: matches[0]!.status === status ? "MATCH" : "NO_MATCH",
      reasons: [{ code: "STAGE_STATUS_EQUALITY", path, actual: matches[0]!.status, expected: status }] };
  }
  return { outcome: "UNSUPPORTED", reasons: [{ code: "UNSUPPORTED_CONDITION", path }] };
}

export interface AllocationItemCandidate {
  readonly materialId: string;
  readonly targetUnits: number;
  readonly minimumUnits: number | null;
  readonly resolvedUnits: number | null;
  readonly estimatedMinutesMin: number | null;
  readonly estimatedMinutesMax: number | null;
  readonly recoveryMode: LearningRecoveryMode;
  readonly adjustment: "NONE" | "MINIMUM" | "UNRESOLVED" | "OVERRIDE";
}

export interface TodayOnlyAllocationOverride {
  readonly scope: "TODAY_ONLY";
  readonly action: "SKIP" | "REPLACE";
  readonly items: readonly { readonly materialId: string; readonly units: number }[];
  readonly reasonCode: string;
}

export interface AllocationResolution {
  readonly status: "RESOLVED" | "SKIPPED" | "NO_MATCH" | "UNSUPPORTED_CONDITION" | "INSUFFICIENT_DATA" | "DEFER_CANDIDATE";
  readonly mode: "NORMAL" | "REDUCED" | "SKIPPED" | "UNKNOWN";
  readonly source: "TODAY_ONLY_OVERRIDE" | "PERSISTED_POLICY" | "DEFAULT" | "NONE";
  readonly selectedPolicyId: string | null;
  readonly selectedPolicyName: string | null;
  readonly condition: ConditionEvaluation | null;
  readonly items: readonly AllocationItemCandidate[];
  readonly capacityFit: "FITS" | "DOES_NOT_FIT" | "UNKNOWN" | "NOT_REQUESTED";
  readonly reasons: readonly { readonly code: string; readonly evidence: Readonly<Record<string, string | number | boolean | null>> }[];
}

type PolicyInput = Pick<LearningAllocationPolicy, "id" | "stageId" | "name" | "activationCondition" | "recoveryMode" | "priority" | "active" | "config">;
type ItemInput = Pick<LearningAllocationItem, "allocationPolicyId" | "materialId" | "targetUnits" | "minimumUnits" | "estimatedMinutesMin" | "estimatedMinutesMax" | "position" | "active">;

export interface ResolveLearningAllocationInput {
  readonly activeStageId: string | null;
  readonly stages: readonly AllocationStageState[];
  readonly materials: readonly AllocationMaterialState[];
  readonly policies: readonly PolicyInput[];
  readonly items: readonly ItemInput[];
  readonly capacity: { readonly availableMinutes: number | null; readonly reductionRequested: boolean } | null;
  readonly todayOverride: TodayOnlyAllocationOverride | null;
  readonly fallbackItems: readonly { readonly materialId: string; readonly targetUnits: number; readonly minimumUnits: number | null }[];
}

const overrideResolution = (override: TodayOnlyAllocationOverride): AllocationResolution => {
  if (override.action === "SKIP") return { status: "SKIPPED", mode: "SKIPPED", source: "TODAY_ONLY_OVERRIDE",
    selectedPolicyId: null, selectedPolicyName: null, condition: null, items: [], capacityFit: "NOT_REQUESTED",
    reasons: [{ code: override.reasonCode, evidence: { temporary: true } }] };
  if (override.items.some((item) => !Number.isFinite(item.units) || item.units < 0)) throw new Error("Invalid today-only allocation units");
  return { status: "RESOLVED", mode: "NORMAL", source: "TODAY_ONLY_OVERRIDE", selectedPolicyId: null,
    selectedPolicyName: null, condition: null, capacityFit: "NOT_REQUESTED",
    items: override.items.map((item) => ({ materialId: item.materialId, targetUnits: item.units, minimumUnits: null,
      resolvedUnits: item.units, estimatedMinutesMin: null, estimatedMinutesMax: null, recoveryMode: "MANUAL", adjustment: "OVERRIDE" })),
    reasons: [{ code: override.reasonCode, evidence: { temporary: true } }] };
};

export function resolveLearningAllocation(input: ResolveLearningAllocationInput): AllocationResolution {
  if (input.todayOverride) return overrideResolution(input.todayOverride);
  const evaluated = input.policies.filter((policy) => policy.active && (policy.stageId === null || policy.stageId === input.activeStageId))
    .map((policy) => ({ policy, evaluation: evaluateLearningActivationCondition(policy.activationCondition,
      { materials: input.materials, stages: input.stages }) }));
  const selected = evaluated.filter((item) => item.evaluation.outcome === "MATCH")
    .sort((left, right) => right.policy.priority - left.policy.priority
      || left.policy.name.localeCompare(right.policy.name) || left.policy.id.localeCompare(right.policy.id))[0];
  if (!selected) {
    if (input.fallbackItems.length > 0) return finalizeItems(input.fallbackItems.map((item, position) => ({
      allocationPolicyId: "default", materialId: item.materialId, targetUnits: item.targetUnits,
      minimumUnits: item.minimumUnits, estimatedMinutesMin: null, estimatedMinutesMax: null, position, active: true
    })), input.capacity, "DEFAULT", null, null, null, input.materials);
    const unsupported = evaluated.find((item) => item.evaluation.outcome === "UNSUPPORTED");
    const insufficient = evaluated.find((item) => item.evaluation.outcome === "INSUFFICIENT_EVIDENCE");
    return { status: unsupported ? "UNSUPPORTED_CONDITION" : insufficient ? "INSUFFICIENT_DATA" : "NO_MATCH",
      mode: "UNKNOWN", source: "NONE", selectedPolicyId: null, selectedPolicyName: null,
      condition: unsupported?.evaluation ?? insufficient?.evaluation ?? null, items: [], capacityFit: "NOT_REQUESTED",
      reasons: [{ code: unsupported ? "NO_POLICY_SELECTED_UNSUPPORTED_CONDITION" : insufficient
        ? "NO_POLICY_SELECTED_MISSING_EVIDENCE" : "NO_POLICY_MATCHED", evidence: { evaluatedPolicies: evaluated.length } }] };
  }
  const items = input.items.filter((item) => item.active && item.allocationPolicyId === selected.policy.id)
    .sort((left, right) => left.position - right.position || left.materialId.localeCompare(right.materialId));
  return finalizeItems(items, input.capacity, "PERSISTED_POLICY", selected.policy.id, selected.policy.name,
    selected.evaluation, input.materials, selected.policy);
}

function finalizeItems(
  items: readonly ItemInput[],
  capacity: ResolveLearningAllocationInput["capacity"],
  source: AllocationResolution["source"],
  policyId: string | null,
  policyName: string | null,
  condition: ConditionEvaluation | null,
  materials: readonly AllocationMaterialState[],
  policy?: PolicyInput
): AllocationResolution {
  if (items.some((item) => !Number.isFinite(item.targetUnits) || item.targetUnits <= 0)) throw new Error("Invalid target allocation");
  const reduction = capacity?.reductionRequested === true;
  const candidates: AllocationItemCandidate[] = items.map((item) => ({
    materialId: item.materialId,
    targetUnits: item.targetUnits,
    minimumUnits: item.minimumUnits,
    resolvedUnits: reduction ? item.minimumUnits : item.targetUnits,
    estimatedMinutesMin: item.estimatedMinutesMin,
    estimatedMinutesMax: item.estimatedMinutesMax,
    recoveryMode: policy ? itemRecoveryMode(policy, item.materialId, materials) : "MANUAL",
    adjustment: reduction ? item.minimumUnits === null ? "UNRESOLVED" : "MINIMUM" : "NONE"
  }));
  const unresolved = candidates.some((item) => item.resolvedUnits === null);
  let capacityFit: AllocationResolution["capacityFit"] = "NOT_REQUESTED";
  const availableMinutes = capacity?.availableMinutes ?? null;
  if (availableMinutes !== null) {
    if (!reduction && candidates.every((item) => item.estimatedMinutesMin !== null && item.estimatedMinutesMax !== null)) {
      const minimum = candidates.reduce((sum, item) => sum + item.estimatedMinutesMin!, 0);
      const maximum = candidates.reduce((sum, item) => sum + item.estimatedMinutesMax!, 0);
      capacityFit = availableMinutes >= maximum ? "FITS" : availableMinutes < minimum ? "DOES_NOT_FIT" : "UNKNOWN";
    } else {
      capacityFit = "UNKNOWN";
    }
  }
  const status = unresolved || capacityFit === "UNKNOWN" ? "INSUFFICIENT_DATA"
    : capacityFit === "DOES_NOT_FIT" ? "DEFER_CANDIDATE" : "RESOLVED";
  return {
    status,
    mode: unresolved ? "UNKNOWN" : reduction ? "REDUCED" : "NORMAL",
    source,
    selectedPolicyId: policyId,
    selectedPolicyName: policyName,
    condition,
    items: candidates,
    capacityFit,
    reasons: [
      { code: source === "DEFAULT" ? "DEFAULT_ALLOCATION_SELECTED" : "POLICY_SELECTED",
        evidence: { policyId, policyName, itemCount: candidates.length } },
      ...(reduction ? [{ code: unresolved ? "MINIMUM_UNITS_MISSING" : "EXPLICIT_MINIMUMS_APPLIED",
        evidence: { unresolvedItems: candidates.filter((item) => item.resolvedUnits === null).length } }] : []),
      ...(capacityFit === "UNKNOWN" ? [{ code: "CAPACITY_FIT_UNAVAILABLE_WITHOUT_TRUSTWORTHY_DURATION",
        evidence: { availableMinutes: capacity?.availableMinutes ?? null } }] : [])
    ]
  };
}

function itemRecoveryMode(
  policy: PolicyInput,
  materialId: string,
  materials: readonly AllocationMaterialState[]
): LearningRecoveryMode {
  const materialKey = materials.find((material) => material.materialId === materialId)?.key;
  if (!materialKey || !record(policy.config)) return policy.recoveryMode;
  const modes = policy.config.itemRecoveryModes;
  if (!record(modes)) return policy.recoveryMode;
  const mode = modes[materialKey];
  return mode === "REDISTRIBUTE" || mode === "RESET" || mode === "CARRY_FORWARD" || mode === "MANUAL"
    ? mode : policy.recoveryMode;
}
