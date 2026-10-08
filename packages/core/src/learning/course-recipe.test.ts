import { describe, expect, it } from "vitest";
import {
  assessmentScopeConfigSchema,
  buildLearningScopeKey,
  courseRecipeConfigSchema,
  mergeCourseRecipeIntoStrategyConfig,
  parseAssessmentScopeConfig,
  parseLearningScopeKey,
  recommendUniversityCourseRecipe,
  readCourseRecipeFromStrategyConfig,
  snowboardLectureActionKey,
  UNIVERSITY_COURSE_RECIPE_PRESETS
} from "./course-recipe.js";

describe("University Course Recipe contract", () => {
  it("keeps six stable, versioned, valid presets", () => {
    expect(Object.keys(UNIVERSITY_COURSE_RECIPE_PRESETS)).toEqual([
      "concept_sql",
      "algorithm_problem_solving",
      "coding_practice",
      "app_development",
      "ai_theory_practice",
      "reading_analysis_writing"
    ]);
    for (const [presetId, recipe] of Object.entries(UNIVERSITY_COURSE_RECIPE_PRESETS)) {
      expect(courseRecipeConfigSchema.parse(recipe)).toEqual(recipe);
      expect(recipe).toMatchObject({ schemaVersion: 1, presetId, presetVersion: 1, userModified: false });
      expect(recipe.actions.filter((action) => action.phase === "BASE")).toHaveLength(3);
      expect(recipe.actions.every((action) => action.scopeType === "MODULE")).toBe(true);
    }
  });

  it("recommends only the six frozen real Course mappings", () => {
    expect(recommendUniversityCourseRecipe("데이터베이스 (001)")?.presetId).toBe("concept_sql");
    expect(recommendUniversityCourseRecipe("알고리즘입문")?.presetId).toBe("algorithm_problem_solving");
    expect(recommendUniversityCourseRecipe("프로그래밍방법론")?.presetId).toBe("coding_practice");
    expect(recommendUniversityCourseRecipe("모바일프로그래밍")?.presetId).toBe("app_development");
    expect(recommendUniversityCourseRecipe("인공지능입문")?.presetId).toBe("ai_theory_practice");
    expect(recommendUniversityCourseRecipe("AI시대의 사고와 의사소통")?.presetId).toBe("reading_analysis_writing");
    expect(recommendUniversityCourseRecipe("알 수 없는 과목")).toBeNull();
  });

  it("maps Snowboard completion only through an explicit preset action contract", () => {
    expect(snowboardLectureActionKey(UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql)).toBe("lecture");
    expect(snowboardLectureActionKey(UNIVERSITY_COURSE_RECIPE_PRESETS.app_development)).toBeNull();
    expect(snowboardLectureActionKey(UNIVERSITY_COURSE_RECIPE_PRESETS.ai_theory_practice)).toBeNull();
    expect(snowboardLectureActionKey(UNIVERSITY_COURSE_RECIPE_PRESETS.reading_analysis_writing)).toBeNull();
  });

  it("fails closed for invalid recipe config", () => {
    const result = readCourseRecipeFromStrategyConfig({
      courseRecipe: { ...UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql, schemaVersion: 2 }
    });
    expect(result).toEqual({ status: "INVALID", recipe: null });
  });

  it("preserves unrelated strategy_config keys while replacing only courseRecipe", () => {
    const strategy = mergeCourseRecipeIntoStrategyConfig({
      reviewCadenceDays: 7,
      nested: { keep: true },
      courseRecipe: { stale: true }
    }, UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql);
    expect(strategy).toMatchObject({ reviewCadenceDays: 7, nested: { keep: true } });
    expect(readCourseRecipeFromStrategyConfig(strategy)).toEqual({
      status: "VALID",
      recipe: UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql
    });
  });
});

describe("Learning scope identity", () => {
  it("builds and parses explicit canonical scope keys", () => {
    expect(buildLearningScopeKey("WEEK", 5)).toBe("week:05");
    expect(buildLearningScopeKey("MODULE", "snowboard-3842")).toBe("module:snowboard-3842");
    expect(buildLearningScopeKey("TOPIC", "graph.search")).toBe("topic:graph.search");
    expect(parseLearningScopeKey("week:05")).toEqual({ key: "week:05", scopeType: "WEEK", stableId: "05", label: "5주차" });
    expect(parseLearningScopeKey("week:5")).toBeNull();
    expect(parseLearningScopeKey("unknown:05")).toBeNull();
  });
});

describe("Assessment scope contract", () => {
  it("accepts a structured contiguous range", () => {
    const value = { schemaVersion: 1 as const, scopeType: "WEEK" as const,
      startKey: "week:04", endKey: "week:07", scopeKeys: null, actionKeys: null };
    expect(assessmentScopeConfigSchema.parse(value)).toEqual(value);
  });

  it("accepts irregular explicit scope keys", () => {
    const value = { schemaVersion: 1 as const, scopeType: "TOPIC" as const,
      startKey: null, endKey: null, scopeKeys: ["topic:joins", "topic:indexes"], actionKeys: ["sql_problem"] };
    expect(parseAssessmentScopeConfig(value)).toEqual(value);
  });

  it("returns unknown for invalid or guessed scope", () => {
    expect(parseAssessmentScopeConfig({ schemaVersion: 1, scopeType: "WEEK",
      startKey: "week:04", endKey: null, scopeKeys: null, actionKeys: null })).toBeNull();
    expect(parseAssessmentScopeConfig({ schemaVersion: 1, scopeType: "WEEK",
      startKey: null, endKey: null, scopeKeys: ["module:4"], actionKeys: null })).toBeNull();
  });
});
