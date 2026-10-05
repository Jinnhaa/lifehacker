import type {
  LearningWorkspaceAction,
  LearningWorkspaceAssessment,
  LearningWorkspaceMaterial,
  UniversityCourseReality
} from "./learning-workspace-types";

export interface UniversityCourseLink {
  readonly courseId: string;
  readonly workContextId: string;
}

export interface UniversitySchoolProgress {
  readonly courseId: string;
  readonly workContextId: string;
  readonly completedLectureCount: number;
  readonly remainingLectureCount: number;
  readonly remainingLectureMinutes: number;
  readonly observedAt: string | Date;
}

export interface UniversityStudyUnit {
  readonly id: string;
  readonly materialId: string | null;
  readonly exposureState: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  readonly understandingState: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  readonly validationState: "NOT_TESTED" | "FAILED" | "PASSED";
}

export function selectUniversityCourses<T extends { readonly id: string; readonly title: string; readonly term: string | null }>(
  courses: readonly T[],
  links: readonly UniversityCourseLink[]
): {
  readonly courses: readonly T[];
  readonly courseIds: ReadonlyMap<string, string>;
  readonly hiddenLegacyIds: ReadonlyMap<string, readonly string[]>;
  readonly diagnostics: readonly { readonly workContextId: string; readonly reason: "unlinked" | "displayed_under_linked_course" }[];
} {
  const courseIds = new Map<string, string>();
  const linkedById = new Map(courses.map((course) => [course.id, course]));
  for (const link of links) {
    if (linkedById.has(link.workContextId) && !courseIds.has(link.workContextId)) courseIds.set(link.workContextId, link.courseId);
  }
  const linked = courses.filter((course) => courseIds.has(course.id));
  const hiddenLegacyIds = new Map<string, string[]>();
  const diagnostics: { workContextId: string; reason: "unlinked" | "displayed_under_linked_course" }[] = [];
  const visible = [...linked];
  for (const course of courses) {
    if (courseIds.has(course.id)) continue;
    const exact = linked.filter((candidate) => candidate.title === course.title && candidate.term === course.term);
    if (exact.length === 1) {
      hiddenLegacyIds.set(exact[0]!.id, [...(hiddenLegacyIds.get(exact[0]!.id) ?? []), course.id]);
      diagnostics.push({ workContextId: course.id, reason: "displayed_under_linked_course" });
    } else {
      visible.push(course);
      diagnostics.push({ workContextId: course.id, reason: "unlinked" });
    }
  }
  return { courses: visible, courseIds, hiddenLegacyIds, diagnostics };
}

export function buildUniversityCourseReality(input: {
  readonly workContextId: string;
  readonly snowboardCourseId: string | null;
  readonly title: string;
  readonly term: string | null;
  readonly schoolProgress: UniversitySchoolProgress | null;
  readonly materials: readonly LearningWorkspaceMaterial[];
  readonly units: readonly UniversityStudyUnit[];
  readonly nextAssessment: LearningWorkspaceAssessment | null;
  readonly actions: readonly LearningWorkspaceAction[];
  readonly hiddenLegacyContextIds: readonly string[];
}): UniversityCourseReality {
  const singleMaterial = input.materials.length === 1 ? input.materials[0]! : null;
  const scopedUnits = singleMaterial ? input.units.filter((unit) => unit.materialId === singleMaterial.id) : [];
  const completedUnits = singleMaterial && scopedUnits.length === input.units.length
    ? singleMaterial.completedUnits : input.units.filter((unit) => unit.exposureState === "COMPLETE").length;
  const totalUnits = singleMaterial && scopedUnits.length === input.units.length
    && singleMaterial.totalScopedUnits !== null && singleMaterial.totalScopedUnits > 0
    && completedUnits <= singleMaterial.totalScopedUnits
    ? singleMaterial.totalScopedUnits : null;
  const selfStudyState = singleMaterial?.state === "COMPLETE" ? "COMPLETE" as const
    : input.units.some((unit) => unit.exposureState !== "NOT_STARTED" || unit.understandingState !== "UNKNOWN"
      || unit.validationState !== "NOT_TESTED") ? "IN_PROGRESS" as const : "NOT_STARTED" as const;
  const count = <T extends string>(key: (unit: UniversityStudyUnit) => T, value: T): number =>
    input.units.filter((unit) => key(unit) === value).length;
  const next = input.actions.find((action) => action.kind === "task" && action.taskId !== null) ?? null;
  const school = input.schoolProgress;
  return {
    workContextId: input.workContextId, snowboardCourseId: input.snowboardCourseId,
    title: input.title, term: input.term,
    schoolProgress: school ? {
      completedLectureCount: school.completedLectureCount,
      remainingLectureCount: school.remainingLectureCount,
      remainingLectureMinutes: school.remainingLectureMinutes,
      observedAt: school.observedAt instanceof Date ? school.observedAt.toISOString() : school.observedAt
    } : null,
    selfStudy: { state: selfStudyState, completedUnits, totalUnits,
      progressPercent: totalUnits === null ? null : Math.min(100, completedUnits / totalUnits * 100) },
    understanding: {
      unknown: count((unit) => unit.understandingState, "UNKNOWN"), weak: count((unit) => unit.understandingState, "WEAK"),
      ok: count((unit) => unit.understandingState, "OK"), strong: count((unit) => unit.understandingState, "STRONG")
    },
    validation: {
      notTested: count((unit) => unit.validationState, "NOT_TESTED"), failed: count((unit) => unit.validationState, "FAILED"),
      passed: count((unit) => unit.validationState, "PASSED")
    },
    // Snowboard lectures and Lifehacker Learning Units have no explicit one-to-one scope mapping.
    gap: { status: "unknown", unitsBehind: null },
    nextAssessment: input.nextAssessment,
    nextLearningTask: next?.taskId ? { taskId: next.taskId, title: next.title } : null,
    diagnostics: { unlinked: input.snowboardCourseId === null, hiddenLegacyContextIds: input.hiddenLegacyContextIds }
  };
}
