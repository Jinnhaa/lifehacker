import { describe, expect, it } from "vitest";
import {
  assessmentScopeConfigSchema,
  buildLearningScopeKey,
  courseRecipeConfigSchema,
  mergeCourseRecipeIntoStrategyConfig,
  parseAssessmentScopeConfig,
  parseLearningScopeKey,
  readCourseRecipeFromStrategyConfig,
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
    }
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
