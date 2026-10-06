import { describe, expect, it } from "vitest";
import { UNIVERSITY_COURSE_RECIPE_PRESETS } from "./course-recipe.js";
import {
  buildCourseRecipeLearningTaskProposal,
  projectCourseRecipeScopes,
  selectNextCourseRecipeCell,
  type CourseRecipeMaterialEvidence,
  type CourseRecipeUnitEvidence
} from "./course-recipe-progress.js";

const recipe = UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql;
const baseActions = recipe.actions.filter((action) => action.phase === "BASE");
const materials: CourseRecipeMaterialEvidence[] = baseActions.map((action) => ({
  materialId: `material-${action.actionKey}`,
  stageId: "stage",
  config: { recipeActionKey: action.actionKey, recipePhase: action.phase,
    presetId: recipe.presetId, presetVersion: recipe.presetVersion }
}));

const unit = (
  actionKey: string,
  week: number,
  exposureState: CourseRecipeUnitEvidence["exposureState"],
  understandingState: CourseRecipeUnitEvidence["understandingState"] = "UNKNOWN",
  validationState: CourseRecipeUnitEvidence["validationState"] = "NOT_TESTED",
  sequenceNo = week
): CourseRecipeUnitEvidence => ({
  learningUnitId: `${actionKey}-${week}`,
  materialId: `material-${actionKey}`,
  canonicalTopicKey: `week:${String(week).padStart(2, "0")}`,
  sequenceNo,
  exposureState,
  understandingState,
  validationState
});

const projectionFor = (units: readonly CourseRecipeUnitEvidence[]) =>
  projectCourseRecipeScopes({ recipe, materials, units });

describe("Scope x Recipe Action projection", () => {
  it("projects multiple Materials independently and derives BASE scope state", () => {
    const projection = projectionFor([
      unit("lecture", 4, "COMPLETE", "WEAK", "PASSED"),
      unit("handout", 4, "COMPLETE"),
      unit("sql_problem", 4, "NOT_STARTED"),
      unit("lecture", 5, "NOT_STARTED"),
      unit("handout", 5, "NOT_STARTED"),
      unit("sql_problem", 5, "NOT_STARTED")
    ]);
    expect(projection.status).toBe("PROJECTED");
    if (projection.status !== "PROJECTED") throw new Error("Expected projected recipe scopes");
    expect(projection.scopes.map((scope) => [scope.scopeKey, scope.baseState])).toEqual([
      ["week:04", "IN_PROGRESS"],
      ["week:05", "NOT_STARTED"]
    ]);
    expect(projection.scopes[0]?.actions[0]).toMatchObject({
      actionKey: "lecture",
      exposure: "COMPLETE",
      understanding: "WEAK",
      validation: "PASSED"
    });
    expect(projection.scopes[0]?.actions[1]).toMatchObject({ understanding: "UNKNOWN", validation: "NOT_TESTED" });
  });

  it("uses sequence only for ordering and never infers a week key from it", () => {
    const projection = projectionFor([
      unit("lecture", 4, "NOT_STARTED", "UNKNOWN", "NOT_TESTED", 40),
      unit("handout", 4, "NOT_STARTED", "UNKNOWN", "NOT_TESTED", 40),
      unit("sql_problem", 4, "NOT_STARTED", "UNKNOWN", "NOT_TESTED", 40)
    ]);
    expect(projection.status).toBe("PROJECTED");
    if (projection.status !== "PROJECTED") throw new Error("Expected projected recipe scopes");
    expect(projection.scopes[0]).toMatchObject({ scopeKey: "week:04", sequence: 40 });
  });

  it("fails closed when a required BASE action mapping or scope identity is missing", () => {
    expect(projectCourseRecipeScopes({ recipe, materials: materials.slice(0, 2), units: [] })).toEqual({
      status: "UNKNOWN", scopes: [], reason: "REQUIRED_BASE_ACTION_MATERIAL_MISSING"
    });
    expect(projectionFor([
      { ...unit("lecture", 4, "NOT_STARTED"), canonicalTopicKey: null },
      unit("handout", 4, "NOT_STARTED"), unit("sql_problem", 4, "NOT_STARTED")
    ])).toEqual({ status: "UNKNOWN", scopes: [], reason: "INVALID_SCOPE_IDENTITY" });
  });
});

describe("Course-level next Recipe cell selector", () => {
  const initial = projectionFor([
    unit("lecture", 4, "COMPLETE"), unit("handout", 4, "COMPLETE"), unit("sql_problem", 4, "NOT_STARTED"),
    unit("lecture", 5, "NOT_STARTED"), unit("handout", 5, "NOT_STARTED"), unit("sql_problem", 5, "NOT_STARTED")
  ]);

  it("selects week 4 action 3 before week 5 action 1 and returns exactly one cell", () => {
    const selected = selectNextCourseRecipeCell({ recipe, projection: initial, activeTasks: [] });
    expect(selected).toMatchObject({ status: "SELECTED", scope: { scopeKey: "week:04" }, cell: { actionKey: "sql_problem" } });
    if (selected.status !== "SELECTED") throw new Error("Expected a selected Recipe cell");
    const proposal = buildCourseRecipeLearningTaskProposal({
      workContextId: "course",
      courseTitle: "데이터베이스",
      stageId: "stage",
      planDate: "2026-10-06",
      importance: 4,
      selection: selected,
      allocationPolicyId: null,
      allocationPolicyName: null,
      estimatedMinutes: 45,
      recoveryMode: "MANUAL"
    });
    expect(proposal).toMatchObject({
      title: "데이터베이스 4주차 SQL / 문제풀이",
      completionCriteria: "4주차 SQL / 문제풀이 완료",
      assignedUnits: 1,
      startSequence: 4,
      endSequence: 4,
      learningUnitIds: ["sql_problem-4"]
    });
  });

  it("advances only after the current scope BASE actions complete", () => {
    const completedWeekFour = projectionFor([
      unit("lecture", 4, "COMPLETE"), unit("handout", 4, "COMPLETE"), unit("sql_problem", 4, "COMPLETE"),
      unit("lecture", 5, "NOT_STARTED"), unit("handout", 5, "NOT_STARTED"), unit("sql_problem", 5, "NOT_STARTED")
    ]);
    expect(selectNextCourseRecipeCell({ recipe, projection: completedWeekFour, activeTasks: [] }))
      .toMatchObject({ status: "SELECTED", scope: { scopeKey: "week:05" }, cell: { actionKey: "lecture" } });
  });

  it("fails closed for unknown evidence and suppresses duplicates while an auto Task is active", () => {
    expect(selectNextCourseRecipeCell({ recipe,
      projection: { status: "UNKNOWN", scopes: [], reason: "INVALID_SCOPE_IDENTITY" }, activeTasks: [] }))
      .toEqual({ status: "UNKNOWN", reason: "INVALID_SCOPE_IDENTITY" });
    expect(selectNextCourseRecipeCell({ recipe, projection: initial,
      activeTasks: [{ materializationKey: "learning:auto:course-recipe:course:week:04:sql_problem" }] }))
      .toEqual({ status: "NONE", reason: "ACTIVE_AUTO_TASK" });
  });
});
