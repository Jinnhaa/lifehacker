import { z } from "zod";
import type { AllocationResolution } from "./learning-allocation.js";
import type { LearningRecoveryMode } from "./learning-v2.js";

export interface LearningTaskUnitEvidence {
  readonly learningUnitId: string;
  readonly sequenceNo: number;
  readonly exposureState: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
}

export interface LearningTaskMaterialEvidence {
  readonly materialId: string;
  readonly title: string;
  readonly unitType: string | null;
  readonly sequenceMode: "BOUNDED" | "OPEN_ENDED";
  readonly units: readonly LearningTaskUnitEvidence[];
}

export interface LearningTaskProposal {
  readonly materializationKey: string;
  readonly workContextId: string;
  readonly stageId: string;
  readonly materialId: string;
  readonly allocationPolicyId: string | null;
  readonly allocationPolicyName: string | null;
  readonly planDate: string;
  readonly importance: number;
  readonly title: string;
  readonly completionCriteria: string;
  readonly assignedUnits: number;
  readonly startSequence: number | null;
  readonly endSequence: number | null;
  readonly learningUnitIds: readonly string[];
  readonly recoveryMode: LearningRecoveryMode;
  readonly source: AllocationResolution["source"];
  readonly reasons: readonly { readonly code: string; readonly evidence: Readonly<Record<string, string | number | boolean | null>> }[];
}

export interface LearningTaskProposalResult {
  readonly status: "PROPOSED" | "SKIPPED" | "INSUFFICIENT_DATA";
  readonly proposals: readonly LearningTaskProposal[];
  readonly reasons: readonly { readonly code: string; readonly evidence: Readonly<Record<string, string | number | boolean | null>> }[];
}

const unitLabel = (unitType: string | null): string => {
  if (unitType === "LESSON") return "강";
  if (unitType === "CHAPTER") return "챕터";
  return unitType ? ` ${unitType}` : "단위";
};

export function proposeLearningTasks(input: {
  readonly workContextId: string;
  readonly stageId: string;
  readonly planDate: string;
  readonly importance: number;
  readonly materializationKeyPrefix: string;
  readonly allocation: AllocationResolution;
  readonly materials: readonly LearningTaskMaterialEvidence[];
}): LearningTaskProposalResult {
  z.iso.date().parse(input.planDate);
  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5) throw new Error("Invalid Task importance");
  if (!input.materializationKeyPrefix.trim()) throw new Error("Materialization key prefix is required");
  if (input.allocation.status === "SKIPPED") return { status: "SKIPPED", proposals: [],
    reasons: [{ code: "TODAY_ALLOCATION_SKIPPED", evidence: { source: input.allocation.source } }] };
  if (input.allocation.status !== "RESOLVED") return { status: "INSUFFICIENT_DATA", proposals: [],
    reasons: [{ code: "ALLOCATION_NOT_EXECUTABLE", evidence: { allocationStatus: input.allocation.status } }] };
  const materials = new Map(input.materials.map((material) => [material.materialId, material]));
  if (materials.size !== input.materials.length) throw new Error("Duplicate material evidence");
  const proposals: LearningTaskProposal[] = [];
  const reasons: LearningTaskProposalResult["reasons"][number][] = [];
  for (const allocation of input.allocation.items) {
    if (allocation.resolvedUnits === null || allocation.resolvedUnits === 0) continue;
    if (!Number.isInteger(allocation.resolvedUnits) || allocation.resolvedUnits < 0) {
      return { status: "INSUFFICIENT_DATA", proposals: [], reasons: [{ code: "NON_INTEGER_UNIT_ALLOCATION",
        evidence: { materialId: allocation.materialId, resolvedUnits: allocation.resolvedUnits } }] };
    }
    const material = materials.get(allocation.materialId);
    if (!material) return { status: "INSUFFICIENT_DATA", proposals: [], reasons: [{ code: "MATERIAL_EVIDENCE_MISSING",
      evidence: { materialId: allocation.materialId } }] };
    const label = unitLabel(material.unitType);
    if (material.sequenceMode === "OPEN_ENDED") {
      const quantity = allocation.resolvedUnits;
      proposals.push({
        materializationKey: `${input.materializationKeyPrefix}:${material.materialId}:quantity:${quantity}`,
        workContextId: input.workContextId,
        stageId: input.stageId,
        materialId: material.materialId,
        allocationPolicyId: input.allocation.selectedPolicyId,
        allocationPolicyName: input.allocation.selectedPolicyName,
        planDate: input.planDate,
        importance: input.importance,
        title: `${material.title} ${quantity}${label}`,
        completionCriteria: `${quantity}${label} 학습 완료`,
        assignedUnits: quantity,
        startSequence: null,
        endSequence: null,
        learningUnitIds: [],
        recoveryMode: allocation.recoveryMode,
        source: input.allocation.source,
        reasons: [...input.allocation.reasons,
          { code: "OPEN_ENDED_QUANTITY_FROM_ALLOCATION", evidence: { assignedUnits: quantity, ordinalKnown: false } }]
      });
      continue;
    }
    const ordered = [...material.units].sort((left, right) => left.sequenceNo - right.sequenceNo);
    if (new Set(ordered.map((unit) => unit.sequenceNo)).size !== ordered.length) throw new Error("Duplicate material sequence evidence");
    const firstIndex = ordered.findIndex((unit) => unit.exposureState !== "COMPLETE");
    if (firstIndex < 0) {
      reasons.push({ code: "MATERIAL_ALREADY_EXPOSED", evidence: { materialId: material.materialId } });
      continue;
    }
    const selected: LearningTaskUnitEvidence[] = [];
    for (let index = firstIndex; index < ordered.length && selected.length < allocation.resolvedUnits; index += 1) {
      const unit = ordered[index]!;
      const expected = selected.length === 0 ? unit.sequenceNo : selected.at(-1)!.sequenceNo + 1;
      if (unit.sequenceNo !== expected || unit.exposureState === "COMPLETE") break;
      selected.push(unit);
    }
    if (selected.length === 0) continue;
    const start = selected[0]!.sequenceNo;
    const end = selected.at(-1)!.sequenceNo;
    const scope = start === end ? `${start}${label}` : `${start}~${end}${label}`;
    proposals.push({
      materializationKey: `${input.materializationKeyPrefix}:${material.materialId}:sequence:${start}-${end}`,
      workContextId: input.workContextId,
      stageId: input.stageId,
      materialId: material.materialId,
      allocationPolicyId: input.allocation.selectedPolicyId,
      allocationPolicyName: input.allocation.selectedPolicyName,
      planDate: input.planDate,
      importance: input.importance,
      title: `${material.title} ${scope}`,
      completionCriteria: `${end}${label}까지 학습 완료`,
      assignedUnits: selected.length,
      startSequence: start,
      endSequence: end,
      learningUnitIds: selected.map((unit) => unit.learningUnitId),
      recoveryMode: allocation.recoveryMode,
      source: input.allocation.source,
      reasons: [...input.allocation.reasons, { code: "NEXT_CONTIGUOUS_INCOMPLETE_SCOPE", evidence: {
        requestedUnits: allocation.resolvedUnits, assignedUnits: selected.length, startSequence: start, endSequence: end
      } }]
    });
  }
  return { status: proposals.length > 0 ? "PROPOSED" : "INSUFFICIENT_DATA", proposals,
    reasons: proposals.length > 0 ? reasons : [...reasons, { code: "NO_EXECUTABLE_SCOPE", evidence: {} }] };
}

export type LearningTaskExecutionCommand =
  | { readonly outcome: "COMPLETED" }
  | { readonly outcome: "PARTIAL"; readonly completedUnits?: number; readonly completedThroughSequence?: number | null }
  | { readonly outcome: "SKIPPED"; readonly existingPendingUnits: number; readonly carryForwardLimitUnits: number | null }
  | { readonly outcome: "CANCELLED" };
