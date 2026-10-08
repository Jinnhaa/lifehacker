import type { CourseRecipeProjectionResult } from "@amber/core";
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
  readonly title: string;
  readonly materialId: string | null;
  readonly sequenceNo: number | null;
  readonly unitType: string | null;
  readonly exposureState: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  readonly understandingState: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  readonly validationState: "NOT_TESTED" | "FAILED" | "PASSED";
}

export interface UniversityPositionConfirmation {
  readonly materialId: string | null;
  readonly throughSequence: number;
}

const SECTION_SUFFIX = /\s+\(\d{3}\)$/u;

export const universityCourseDisplayTitle = (title: string): string => title.replace(SECTION_SUFFIX, "").trim();

export function selectUniversityCourses<T extends { readonly id: string; readonly title: string; readonly term: string | null }>(
  courses: readonly T[],
  links: readonly UniversityCourseLink[]
): {
  readonly courses: readonly T[];
  readonly courseIds: ReadonlyMap<string, string>;
  readonly displayTitles: ReadonlyMap<string, string>;
  readonly hiddenLegacyIds: ReadonlyMap<string, readonly string[]>;
  readonly currentTerm: string | null;
  readonly diagnostics: readonly {
    readonly workContextId: string;
    readonly title: string;
    readonly reason: "legacy_duplicate" | "duplicate_snowboard_course" | "not_current_snowboard_course" | "unlinked";
  }[];
} {
  const courseIds = new Map<string, string>();
  const linkedById = new Map(courses.map((course) => [course.id, course]));
  for (const link of links) {
    if (linkedById.has(link.workContextId) && !courseIds.has(link.workContextId)) courseIds.set(link.workContextId, link.courseId);
  }
  const linked = courses.filter((course) => courseIds.has(course.id));
  const linkedTerms = linked.map((course) => course.term).filter((term): term is string => term !== null);
  const academicTerms = linkedTerms.filter((term) => /^\d{4}-[12]$/u.test(term));
  const currentTerm = (academicTerms.length ? academicTerms : linkedTerms)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0] ?? null;
  const current = linked.filter((course) => currentTerm === null || course.term === currentTerm);
  const displayTitles = new Map<string, string>();
  const hiddenLegacyIds = new Map<string, string[]>();
  const diagnostics: {
    workContextId: string; title: string;
    reason: "legacy_duplicate" | "duplicate_snowboard_course" | "not_current_snowboard_course" | "unlinked";
  }[] = [];
  const grouped = new Map<string, T[]>();
  for (const course of current) {
    const displayTitle = universityCourseDisplayTitle(course.title);
    const key = `${course.term ?? ""}\u0000${displayTitle}`;
    grouped.set(key, [...(grouped.get(key) ?? []), course]);
  }
  const visible: T[] = [];
  for (const candidates of grouped.values()) {
    const ordered = [...candidates].sort((left, right) => {
      const leftId = courseIds.get(left.id) ?? "";
      const rightId = courseIds.get(right.id) ?? "";
      return leftId.localeCompare(rightId) || left.id.localeCompare(right.id);
    });
    const canonical = ordered[0]!;
    visible.push(canonical);
    displayTitles.set(canonical.id, universityCourseDisplayTitle(canonical.title));
    for (const duplicate of ordered.slice(1)) {
      hiddenLegacyIds.set(canonical.id, [...(hiddenLegacyIds.get(canonical.id) ?? []), duplicate.id]);
      diagnostics.push({ workContextId: duplicate.id, title: duplicate.title, reason: "duplicate_snowboard_course" });
    }
  }
  for (const course of linked) {
    if (current.includes(course)) continue;
    diagnostics.push({ workContextId: course.id, title: course.title, reason: "not_current_snowboard_course" });
  }
  for (const course of courses) {
    if (courseIds.has(course.id)) continue;
    const exact = visible.filter((candidate) => universityCourseDisplayTitle(candidate.title) === universityCourseDisplayTitle(course.title)
      && candidate.term === course.term);
    if (exact.length === 1) {
      hiddenLegacyIds.set(exact[0]!.id, [...(hiddenLegacyIds.get(exact[0]!.id) ?? []), course.id]);
      diagnostics.push({ workContextId: course.id, title: course.title, reason: "legacy_duplicate" });
    } else {
      diagnostics.push({ workContextId: course.id, title: course.title, reason: "unlinked" });
    }
  }
  visible.sort((left, right) => (displayTitles.get(left.id) ?? left.title).localeCompare(displayTitles.get(right.id) ?? right.title, "ko"));
  return { courses: visible, courseIds, displayTitles, hiddenLegacyIds, currentTerm, diagnostics };
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
  readonly positionConfirmation: UniversityPositionConfirmation | null;
  readonly recipeProjection?: CourseRecipeProjectionResult | null;
  readonly recipeBaseActions?: readonly { readonly actionKey: string; readonly label: string; readonly order: number }[];
}): UniversityCourseReality {
  const singleMaterial = input.materials.length === 1 ? input.materials[0]! : null;
  const scopedUnits = singleMaterial ? input.units.filter((unit) => unit.materialId === singleMaterial.id) : [];
  const orderedUnits = singleMaterial && scopedUnits.length === input.units.length
    ? [...scopedUnits].filter((unit) => unit.sequenceNo !== null)
      .sort((left, right) => left.sequenceNo! - right.sequenceNo!) : [];
  const legacyScopeReady = Boolean(singleMaterial && orderedUnits.length > 0 && orderedUnits.length === input.units.length
    && new Set(orderedUnits.map((unit) => unit.sequenceNo)).size === orderedUnits.length);
  const recipeScopes = input.recipeProjection?.status === "PROJECTED" ? input.recipeProjection.scopes : null;
  const scopeReady = recipeScopes !== null
    ? recipeScopes.length > 0 && recipeScopes.every((scope) => scope.baseState !== "UNKNOWN")
    : legacyScopeReady;
  const recipeBaseCells = recipeScopes?.flatMap((scope) => scope.actions
    .filter((action) => action.phase === "BASE" && action.requiredForBaseCompletion)) ?? null;
  const exposedUnits = input.units.filter((unit) => unit.exposureState !== "NOT_STARTED");
  const completedUnits = recipeBaseCells
    ? recipeBaseCells.filter((cell) => cell.exposure === "COMPLETE").length
    : singleMaterial && scopedUnits.length === input.units.length
      ? singleMaterial.completedUnits : input.units.filter((unit) => unit.exposureState === "COMPLETE").length;
  const totalUnits = recipeBaseCells
    ? recipeBaseCells.length
    : singleMaterial && scopedUnits.length === input.units.length
      && singleMaterial.totalScopedUnits !== null && singleMaterial.totalScopedUnits > 0
      && completedUnits <= singleMaterial.totalScopedUnits
      ? singleMaterial.totalScopedUnits : null;
  const selfStudyState = recipeScopes
    ? recipeScopes.every((scope) => scope.baseState === "COMPLETE") ? "COMPLETE" as const
      : recipeScopes.some((scope) => scope.baseState === "IN_PROGRESS" || scope.baseState === "COMPLETE") ? "IN_PROGRESS" as const
        : "NOT_STARTED" as const
    : input.units.length > 0 && input.units.every((unit) => unit.exposureState === "COMPLETE") ? "COMPLETE" as const
      : exposedUnits.length > 0 ? "IN_PROGRESS" as const : "NOT_STARTED" as const;
  const furthest = [...exposedUnits].filter((unit) => unit.sequenceNo !== null)
    .sort((left, right) => right.sequenceNo! - left.sequenceNo!)[0] ?? null;
  const furthestRecipeScope = recipeScopes ? [...recipeScopes]
    .filter((scope) => scope.baseState === "IN_PROGRESS" || scope.baseState === "COMPLETE")
    .sort((left, right) => right.sequence - left.sequence)[0] ?? null : null;
  const matchingConfirmation = input.positionConfirmation?.materialId === singleMaterial?.id ? input.positionConfirmation : null;
  const confirmedStart = matchingConfirmation?.throughSequence === 0;
  const initialized = recipeScopes ? recipeBaseCells!.some((cell) => cell.exposure !== "NOT_STARTED")
    : exposedUnits.length > 0 || matchingConfirmation !== null;
  const count = <T extends string>(key: (unit: UniversityStudyUnit) => T, value: T): number =>
    input.units.filter((unit) => key(unit) === value).length;
  const next = input.actions.find((action) => action.kind === "task" && action.taskId !== null) ?? null;
  const recommended = input.actions.find((action) => action.learningUnitId !== null) ?? null;
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
    selfStudy: { state: selfStudyState, initialized,
      scopeStatus: scopeReady ? "READY" : "NOT_READY", completedUnits, totalUnits,
      progressPercent: !initialized || totalUnits === null ? null : Math.min(100, completedUnits / totalUnits * 100),
      currentPositionSequence: recipeScopes ? furthestRecipeScope?.sequence ?? null : confirmedStart ? 0 : furthest?.sequenceNo ?? null,
      currentPositionLabel: recipeScopes ? furthestRecipeScope?.scopeLabel ?? null : confirmedStart ? "시작 전" : furthest?.title ?? null,
      positionOptions: recipeScopes ? [] : scopeReady ? orderedUnits.map((unit) => ({ sequenceNo: unit.sequenceNo!, label: unit.title })) : [],
      materialId: recipeScopes ? null : scopeReady ? singleMaterial!.id : null },
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
    nextLearningTask: next?.taskId ? { taskId: next.taskId, title: next.title, estimatedMinutes: next.estimatedMinutes } : null,
    recommendedAction: recommended?.learningUnitId ? {
      learningUnitId: recommended.learningUnitId, title: recommended.title, estimatedMinutes: recommended.estimatedMinutes
    } : null,
    recipeBaseActions: [...(input.recipeBaseActions ?? [])].sort((left, right) => left.order - right.order),
    diagnostics: { unlinked: input.snowboardCourseId === null, hiddenLegacyContextIds: input.hiddenLegacyContextIds },
    scopeActionProgress: input.recipeProjection ?? null
  };
}

export const universitySelfStudyLabel = (reality: UniversityCourseReality): string => {
  if (!reality.selfStudy.initialized) return "현재 위치 미설정";
  return reality.selfStudy.currentPositionLabel ?? "시작 전";
};

export function summarizeUniversityCourses(
  courses: readonly { readonly title: string; readonly state: "normal" | "attention" | "risk" | "unknown" }[]
): { readonly courseCount: number; readonly riskTitles: readonly string[] } {
  return { courseCount: courses.length, riskTitles: courses.filter((course) => course.state === "risk").map((course) => course.title) };
}

export const learningDetailExperience = (kind: "course" | "certification"): "university_reality" | "existing_learning" =>
  kind === "course" ? "university_reality" : "existing_learning";
