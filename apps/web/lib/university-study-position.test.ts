import { describe, expect, it } from "vitest";
import { planCurrentStudyPosition, type StudyPositionUnit } from "./university-study-position";

const units = (): StudyPositionUnit[] => Array.from({ length: 4 }, (_, index) => ({
  id: `unit-${index + 1}`, sequenceNo: index + 1,
  exposureState: index === 0 ? "COMPLETE" : "NOT_STARTED",
  understandingState: index === 1 ? "WEAK" : "UNKNOWN",
  validationState: index === 2 ? "PASSED" : "NOT_TESTED"
}));

describe("current University study-position adapter", () => {
  it("plans Exposure-only updates through the selected existing scope", () => {
    const evidence = units();
    expect(planCurrentStudyPosition(evidence, 3)).toEqual({
      throughSequence: 3, unitIdsToComplete: ["unit-2", "unit-3"]
    });
    expect(evidence[1]).toMatchObject({ understandingState: "WEAK", validationState: "NOT_TESTED" });
    expect(evidence[2]).toMatchObject({ understandingState: "UNKNOWN", validationState: "PASSED" });
    expect(evidence[3]?.exposureState).toBe("NOT_STARTED");
  });

  it("is repeatable and advances safely without duplicating evidence updates", () => {
    const completed = units().map((unit, index) => index < 3 ? { ...unit, exposureState: "COMPLETE" as const } : unit);
    expect(planCurrentStudyPosition(completed, 3).unitIdsToComplete).toEqual([]);
    expect(planCurrentStudyPosition(completed, 4).unitIdsToComplete).toEqual(["unit-4"]);
  });

  it("does not erase later existing evidence or invent missing scope", () => {
    expect(() => planCurrentStudyPosition(units(), 0)).toThrow("이전 위치로 되돌릴 수 없습니다");
    expect(() => planCurrentStudyPosition([], 0)).toThrow("학습 범위가 아직 없습니다");
  });
});
