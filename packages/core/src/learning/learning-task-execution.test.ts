import { describe, expect, it } from "vitest";
import type { AllocationResolution } from "./learning-allocation.js";
import { proposeLearningTasks } from "./learning-task-execution.js";

const allocation = (materialId: string): AllocationResolution => ({
  status: "RESOLVED",
  mode: "NORMAL",
  source: "PERSISTED_POLICY",
  selectedPolicyId: "policy",
  selectedPolicyName: "Next lesson",
  condition: { outcome: "MATCH", reasons: [] },
  items: [{
    materialId,
    targetUnits: 1,
    minimumUnits: null,
    resolvedUnits: 1,
    estimatedMinutesMin: 60,
    estimatedMinutesMax: 60,
    recoveryMode: "MANUAL",
    adjustment: "NONE"
  }],
  capacityFit: "NOT_REQUESTED",
  reasons: []
});

describe("proposeLearningTasks", () => {
  it("proposes only the next contiguous incomplete scope for a Material", () => {
    const result = proposeLearningTasks({
      workContextId: "course",
      stageId: "stage",
      planDate: "2026-10-01",
      importance: 3,
      materializationKeyPrefix: "learning:2026-10-01:course",
      allocation: allocation("material"),
      materials: [{
        materialId: "material",
        title: "DB 교안",
        unitType: "LESSON",
        sequenceMode: "BOUNDED",
        units: [
          { learningUnitId: "17", sequenceNo: 17, exposureState: "COMPLETE" },
          { learningUnitId: "18", sequenceNo: 18, exposureState: "NOT_STARTED" },
          { learningUnitId: "19", sequenceNo: 19, exposureState: "NOT_STARTED" }
        ]
      }]
    });

    expect(result.status).toBe("PROPOSED");
    expect(result.proposals).toEqual([
      expect.objectContaining({
        title: "DB 교안 18강",
        startSequence: 18,
        endSequence: 18,
        assignedUnits: 1,
        estimatedMinutes: 60,
        learningUnitIds: ["18"]
      })
    ]);
  });
});
