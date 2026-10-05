import { describe, expect, it } from "vitest";
import type { LearningWorkspaceAction, LearningWorkspaceMaterial } from "./learning-workspace-types";
import { buildUniversityCourseReality, selectUniversityCourses } from "./university-course-reality";

const material: LearningWorkspaceMaterial = {
  id: "material-1", title: "교안", stageId: null, materialType: "slides", unitType: "LESSON",
  totalUnits: 11, startUnit: null, state: "IN_PROGRESS", completedUnits: 6, totalScopedUnits: 11,
  progressPercent: 6 / 11 * 100, exposure: "학습 중", understanding: "기록 없음", validation: "미검증"
};
const nextTask: LearningWorkspaceAction = {
  kind: "task", taskId: "task-7", targetId: "target-7", materialId: material.id,
  allocationPolicyId: null, title: "DB 교안 7강", assignedUnits: 1, startSequence: 7, endSequence: 7,
  policyName: null, source: "CANONICAL_TASK", reasons: [], estimatedMinutes: 30, proposal: null
};
const units = Array.from({ length: 11 }, (_, index) => ({
  id: `unit-${index + 1}`, materialId: material.id,
  exposureState: index < 6 ? "COMPLETE" as const : "NOT_STARTED" as const,
  understandingState: "UNKNOWN" as const,
  validationState: "NOT_TESTED" as const
}));

describe("University Course reality", () => {
  it("keeps school observation, exposure, understanding, and validation independent", () => {
    const reality = buildUniversityCourseReality({
      workContextId: "linked", snowboardCourseId: "89632", title: "Database", term: "2026-2",
      schoolProgress: { courseId: "89632", workContextId: "linked", completedLectureCount: 8,
        remainingLectureCount: 3, remainingLectureMinutes: 95, observedAt: new Date("2026-10-05T00:00:00Z") },
      materials: [material], units, nextAssessment: null, actions: [nextTask], hiddenLegacyContextIds: []
    });
    expect(reality.schoolProgress).toMatchObject({ completedLectureCount: 8, remainingLectureCount: 3 });
    expect(reality.selfStudy).toMatchObject({ completedUnits: 6, totalUnits: 11 });
    expect(reality.understanding).toEqual({ unknown: 11, weak: 0, ok: 0, strong: 0 });
    expect(reality.validation).toEqual({ notTested: 11, failed: 0, passed: 0 });
    expect(reality.gap).toEqual({ status: "unknown", unitsBehind: null });
    expect(reality.nextLearningTask).toEqual({ taskId: "task-7", title: "DB 교안 7강" });
  });

  it("does not fabricate a percentage when material scope has no denominator", () => {
    const reality = buildUniversityCourseReality({
      workContextId: "linked", snowboardCourseId: "89632", title: "Database", term: null,
      schoolProgress: null, materials: [{ ...material, completedUnits: 1, totalScopedUnits: null, progressPercent: null }],
      units: [units[0]!], nextAssessment: null, actions: [], hiddenLegacyContextIds: []
    });
    expect(reality.selfStudy).toMatchObject({ completedUnits: 1, totalUnits: null, progressPercent: null });
    expect(reality.understanding.unknown).toBe(1);
    expect(reality.validation.notTested).toBe(1);
  });

  it("treats an empty scope as an unknown denominator", () => {
    const reality = buildUniversityCourseReality({
      workContextId: "linked", snowboardCourseId: "89632", title: "Database", term: null,
      schoolProgress: null, materials: [{ ...material, completedUnits: 0, totalScopedUnits: 0, progressPercent: null }],
      units: [], nextAssessment: null, actions: [], hiddenLegacyContextIds: []
    });
    expect(reality.selfStudy).toMatchObject({ completedUnits: 0, totalUnits: null, progressPercent: null });
  });

  it("prefers one linked Course for an exact legacy duplicate and reports every unlinked context", () => {
    const courses = [
      { id: "legacy", title: "Database", term: "2026-2" },
      { id: "linked", title: "Database", term: "2026-2" },
      { id: "ambiguous", title: "Database", term: "2025-2" }
    ];
    const result = selectUniversityCourses(courses, [
      { courseId: "89632", workContextId: "linked" },
      { courseId: "89632", workContextId: "linked" }
    ]);
    expect(result.courses.map((course) => course.id)).toEqual(["linked", "ambiguous"]);
    expect(result.courseIds.get("linked")).toBe("89632");
    expect(result.hiddenLegacyIds.get("linked")).toEqual(["legacy"]);
    expect(result.diagnostics).toEqual([
      { workContextId: "legacy", reason: "displayed_under_linked_course" },
      { workContextId: "ambiguous", reason: "unlinked" }
    ]);
    expect(courses).toHaveLength(3);
  });
});
