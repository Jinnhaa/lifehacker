export interface StudyPositionUnit {
  readonly id: string;
  readonly sequenceNo: number | null;
  readonly exposureState: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  readonly understandingState: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  readonly validationState: "NOT_TESTED" | "FAILED" | "PASSED";
}

export interface StudyPositionPlan {
  readonly throughSequence: number;
  readonly unitIdsToComplete: readonly string[];
}

/** Translates an explicit user correction into Exposure-only changes on existing ordered Learning Units. */
export function planCurrentStudyPosition(
  units: readonly StudyPositionUnit[],
  throughSequence: number
): StudyPositionPlan {
  if (!Number.isInteger(throughSequence) || throughSequence < 0) throw new Error("현재 공부 위치를 확인해 주세요.");
  const ordered = [...units].filter((unit) => unit.sequenceNo !== null)
    .sort((left, right) => left.sequenceNo! - right.sequenceNo!);
  if (!ordered.length || ordered.length !== units.length) throw new Error("현재 위치를 연결할 학습 범위가 아직 없습니다.");
  if (new Set(ordered.map((unit) => unit.sequenceNo)).size !== ordered.length) throw new Error("학습 범위 순서를 확인해 주세요.");
  const furthestEvidence = ordered.filter((unit) => unit.exposureState !== "NOT_STARTED").at(-1)?.sequenceNo ?? 0;
  if (throughSequence < furthestEvidence) {
    throw new Error("이미 확인된 학습 증거보다 이전 위치로 되돌릴 수 없습니다.");
  }
  if (throughSequence > 0 && !ordered.some((unit) => unit.sequenceNo === throughSequence)) {
    throw new Error("선택한 학습 범위를 찾지 못했습니다.");
  }
  return {
    throughSequence,
    unitIdsToComplete: ordered.filter((unit) => unit.sequenceNo! <= throughSequence && unit.exposureState !== "COMPLETE")
      .map((unit) => unit.id)
  };
}
