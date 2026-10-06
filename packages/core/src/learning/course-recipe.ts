import type { UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import { z } from "zod";

export const courseRecipePhaseSchema = z.enum(["BASE", "REVIEW", "ASSESSMENT_PREP"]);
export const learningScopeTypeSchema = z.enum(["WEEK", "MODULE", "TOPIC"]);

const actionKeySchema = z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/u);

export const courseRecipeActionSchema = z.object({
  actionKey: actionKeySchema,
  phase: courseRecipePhaseSchema,
  label: z.string().trim().min(1).max(200),
  scopeType: learningScopeTypeSchema,
  completionRule: z.string().trim().min(1).max(300),
  defaultEstimatedMinutes: z.number().int().positive().nullable(),
  order: z.number().int().positive(),
  requiredForBaseCompletion: z.boolean()
}).strict().superRefine((action, context) => {
  if (action.phase !== "BASE" && action.requiredForBaseCompletion) {
    context.addIssue({ code: "custom", message: "Only BASE actions may be required for BASE completion" });
  }
});

export const courseRecipeConfigSchema = z.object({
  schemaVersion: z.literal(1),
  presetId: z.string().trim().min(1).max(100),
  presetVersion: z.number().int().positive(),
  courseType: z.string().trim().min(1).max(120),
  userModified: z.boolean(),
  actions: z.array(courseRecipeActionSchema).min(1)
}).strict().superRefine((recipe, context) => {
  const actionKeys = recipe.actions.map((action) => action.actionKey);
  const orders = recipe.actions.map((action) => action.order);
  if (new Set(actionKeys).size !== actionKeys.length) {
    context.addIssue({ code: "custom", path: ["actions"], message: "Recipe action keys must be unique" });
  }
  if (new Set(orders).size !== orders.length) {
    context.addIssue({ code: "custom", path: ["actions"], message: "Recipe action order must be unique" });
  }
  if (!recipe.actions.some((action) => action.phase === "BASE" && action.requiredForBaseCompletion)) {
    context.addIssue({ code: "custom", path: ["actions"], message: "Recipe requires at least one required BASE action" });
  }
});

export type CourseRecipePhase = z.infer<typeof courseRecipePhaseSchema>;
export type LearningScopeType = z.infer<typeof learningScopeTypeSchema>;
export type CourseRecipeAction = z.infer<typeof courseRecipeActionSchema>;
export type CourseRecipeConfig = z.infer<typeof courseRecipeConfigSchema>;

export const courseRecipeMaterialBindingSchema = z.object({
  recipeActionKey: actionKeySchema,
  recipePhase: courseRecipePhaseSchema,
  presetId: z.string().trim().min(1).max(100),
  presetVersion: z.number().int().positive()
}).passthrough();

export type CourseRecipeMaterialBinding = Pick<
  z.infer<typeof courseRecipeMaterialBindingSchema>,
  "recipeActionKey" | "recipePhase" | "presetId" | "presetVersion"
>;

export const assessmentScopeConfigSchema = z.object({
  schemaVersion: z.literal(1),
  scopeType: learningScopeTypeSchema,
  startKey: z.string().trim().min(1).nullable(),
  endKey: z.string().trim().min(1).nullable(),
  scopeKeys: z.array(z.string().trim().min(1)).min(1).nullable(),
  actionKeys: z.array(actionKeySchema).min(1).nullable()
}).strict().superRefine((scope, context) => {
  const hasStart = scope.startKey !== null;
  const hasEnd = scope.endKey !== null;
  const hasRange = hasStart && hasEnd;
  if (hasStart !== hasEnd) {
    context.addIssue({ code: "custom", message: "Assessment scope range requires both startKey and endKey" });
  }
  if (hasRange === (scope.scopeKeys !== null)) {
    context.addIssue({ code: "custom", message: "Assessment scope requires exactly one range or explicit scopeKeys" });
  }
  const keys = scope.scopeKeys ?? (hasRange ? [scope.startKey!, scope.endKey!] : []);
  for (const [index, key] of keys.entries()) {
    const parsed = parseLearningScopeKey(key);
    if (!parsed || parsed.scopeType !== scope.scopeType) {
      context.addIssue({ code: "custom", path: scope.scopeKeys ? ["scopeKeys", index] : [], message: "Scope key does not match scopeType" });
    }
  }
});

export type AssessmentScopeConfig = z.infer<typeof assessmentScopeConfigSchema>;

export type CourseRecipeReadResult =
  | { readonly status: "ABSENT"; readonly recipe: null }
  | { readonly status: "INVALID"; readonly recipe: null }
  | { readonly status: "VALID"; readonly recipe: CourseRecipeConfig };

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;

export function readCourseRecipeFromStrategyConfig(strategyConfig: unknown): CourseRecipeReadResult {
  const strategy = asObject(strategyConfig);
  if (!strategy || !("courseRecipe" in strategy)) return { status: "ABSENT", recipe: null };
  const parsed = courseRecipeConfigSchema.safeParse(strategy.courseRecipe);
  return parsed.success ? { status: "VALID", recipe: parsed.data } : { status: "INVALID", recipe: null };
}

/** Returns a new object and changes only strategy_config.courseRecipe. */
export function mergeCourseRecipeIntoStrategyConfig(strategyConfig: unknown, recipe: unknown): JsonObject {
  const parsed = courseRecipeConfigSchema.parse(recipe);
  return { ...(asObject(strategyConfig) ?? {}), courseRecipe: parsed };
}

export function readCourseRecipeMaterialBinding(config: unknown): CourseRecipeMaterialBinding | null {
  const parsed = courseRecipeMaterialBindingSchema.safeParse(config);
  if (!parsed.success) return null;
  return {
    recipeActionKey: parsed.data.recipeActionKey,
    recipePhase: parsed.data.recipePhase,
    presetId: parsed.data.presetId,
    presetVersion: parsed.data.presetVersion
  };
}

export function parseAssessmentScopeConfig(value: unknown): AssessmentScopeConfig | null {
  const parsed = assessmentScopeConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export interface LearningScopeIdentity {
  readonly key: string;
  readonly scopeType: LearningScopeType;
  readonly stableId: string;
  readonly label: string;
}

const stableScopeId = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

export function buildLearningScopeKey(scopeType: LearningScopeType, stableId: string | number): string {
  if (scopeType === "WEEK") {
    const week = typeof stableId === "number" ? stableId : Number(stableId);
    if (!Number.isInteger(week) || week <= 0) throw new Error("Week scope requires a positive integer");
    return `week:${String(week).padStart(2, "0")}`;
  }
  const value = String(stableId).trim();
  if (!stableScopeId.test(value)) throw new Error(`${scopeType} scope requires a stable identifier`);
  return `${scopeType.toLowerCase()}:${value}`;
}

export function parseLearningScopeKey(value: unknown): LearningScopeIdentity | null {
  if (typeof value !== "string") return null;
  const [prefix, ...rest] = value.split(":");
  const stableId = rest.join(":");
  if (prefix === "week") {
    if (!/^\d{2,}$/u.test(stableId)) return null;
    const week = Number(stableId);
    if (!Number.isInteger(week) || week <= 0) return null;
    return { key: value, scopeType: "WEEK", stableId, label: `${week}주차` };
  }
  if ((prefix !== "module" && prefix !== "topic") || !stableScopeId.test(stableId)) return null;
  return {
    key: value,
    scopeType: prefix === "module" ? "MODULE" : "TOPIC",
    stableId,
    label: stableId
  };
}

type PresetId =
  | "concept_sql"
  | "algorithm_problem_solving"
  | "coding_practice"
  | "app_development"
  | "ai_theory_practice"
  | "reading_analysis_writing";

type PresetAction = readonly [actionKey: string, label: string];

const preset = (
  presetId: PresetId,
  courseType: string,
  base: readonly PresetAction[],
  review: readonly PresetAction[],
  assessmentPrep: readonly PresetAction[]
): CourseRecipeConfig => courseRecipeConfigSchema.parse({
  schemaVersion: 1,
  presetId,
  presetVersion: 1,
  courseType,
  userModified: false,
  actions: [...base.map(([actionKey, label], index) => ({
    actionKey, label, phase: "BASE" as const, scopeType: "WEEK" as const,
    completionRule: "EXPLICIT_SCOPE_COMPLETION", defaultEstimatedMinutes: null,
    order: index + 1, requiredForBaseCompletion: true
  })), ...review.map(([actionKey, label], index) => ({
    actionKey, label, phase: "REVIEW" as const, scopeType: "WEEK" as const,
    completionRule: "EXPLICIT_SCOPE_COMPLETION", defaultEstimatedMinutes: null,
    order: base.length + index + 1, requiredForBaseCompletion: false
  })), ...assessmentPrep.map(([actionKey, label], index) => ({
    actionKey, label, phase: "ASSESSMENT_PREP" as const, scopeType: "WEEK" as const,
    completionRule: "EXPLICIT_SCOPE_COMPLETION", defaultEstimatedMinutes: null,
    order: base.length + review.length + index + 1, requiredForBaseCompletion: false
  }))]
});

export const UNIVERSITY_COURSE_RECIPE_PRESETS: Readonly<Record<PresetId, CourseRecipeConfig>> = Object.freeze({
  concept_sql: preset("concept_sql", "CONCEPT_SQL_PROBLEM_SOLVING",
    [["lecture", "온라인 강의 수강"], ["handout", "교안 학습"], ["sql_problem", "SQL / 문제풀이"]],
    [["handout_review", "교안 다시 보기"], ["wrong_problem_review", "틀린 문제 다시 풀기"]],
    [["exam_scope_review", "시험범위 집중 복습"], ["problem_retry", "문제 재풀이"]]),
  algorithm_problem_solving: preset("algorithm_problem_solving", "THEORY_PROBLEM_SOLVING_IMPLEMENTATION",
    [["concept", "개념 / 교안 학습"], ["trace_problem", "손추적 / 지필 문제풀이"], ["implementation", "알고리즘 구현"]],
    [["weak_concept_review", "약한 개념 다시 학습"], ["wrong_problem_review", "틀린 문제 재풀이"], ["reimplementation", "핵심 알고리즘 재구현"]],
    [["exam_algorithm_review", "시험범위 핵심 알고리즘 복습"], ["exam_problem_repeat", "지필 문제 / 구현 문제 반복"]]),
  coding_practice: preset("coding_practice", "CODING_PRACTICE",
    [["concept", "개념 / 교안 학습"], ["example_run", "예제 코드 실행"], ["code_write", "직접 코드 작성"]],
    [["example_reimplementation", "예제 다시 구현"], ["syntax_error_review", "오류 / 문법 포인트 복습"]],
    [["exam_code_write", "시험범위 코드 직접 작성"], ["output_error_concept_review", "출력 / 오류 / 개념 문제 복습"]]),
  app_development: preset("app_development", "CODING_APP_DEVELOPMENT",
    [["concept", "개념 / 강의 학습"], ["example_app", "예제 앱 / 코드 실행"], ["feature_implementation", "기능 직접 구현"]],
    [["feature_reimplementation", "예제 기능 다시 구현"], ["architecture_review", "상태 / UI / 구조 복습"]],
    [["implementation_review", "관련 범위 구현 복습"], ["assignment_readiness", "과제 readiness 확인"]]),
  ai_theory_practice: preset("ai_theory_practice", "THEORY_PROBLEM_SOLVING_PRACTICE",
    [["concept", "강의 / 교안 학습"], ["concept_problem", "개념 / 계산 문제풀이"], ["algorithm_practice", "알고리즘 / 코드 실습"]],
    [["weak_concept_review", "약한 개념 다시 학습"], ["problem_retry", "문제 재풀이"]],
    [["exam_concept_review", "시험범위 개념 복습"], ["representative_problem_repeat", "대표 문제 / 알고리즘 반복"]]),
  reading_analysis_writing: preset("reading_analysis_writing", "READING_ANALYSIS_WRITING",
    [["reading", "작품 / 자료 읽기"], ["analysis", "핵심 분석 / 정리"], ["writing_presentation", "글쓰기 / 발표 준비"]],
    [["key_argument_review", "핵심 인용 / 논점 다시 보기"], ["feedback_revision", "교수 피드백 반영"]],
    [["submission_completion", "제출물 / 발표 완성"], ["requirement_check", "요구사항 최종 확인"]])
});

/** Merge-safe persistence adapter. It never replaces unrelated strategy_config keys. */
export class SupabaseCourseRecipeRepository {
  constructor(private readonly sql: Sql) {}

  async read(userId: UserId, workContextId: string): Promise<CourseRecipeReadResult> {
    const rows = await this.sql<{ strategy_config: unknown }[]>`
      select strategy_config from public.work_contexts
      where id=${workContextId} and user_id=${userId} and kind='course' and archived_at is null`;
    return rows[0] ? readCourseRecipeFromStrategyConfig(rows[0].strategy_config) : { status: "ABSENT", recipe: null };
  }

  async save(userId: UserId, workContextId: string, recipe: unknown): Promise<void> {
    const parsed = courseRecipeConfigSchema.parse(recipe);
    const result = await this.sql`
      update public.work_contexts
      set strategy_config=strategy_config || ${this.sql.json({ courseRecipe: parsed } as unknown as JSONValue)}
      where id=${workContextId} and user_id=${userId} and kind='course' and archived_at is null`;
    if (result.count !== 1) throw new Error("Course Recipe을 저장할 Course를 찾지 못했습니다.");
  }
}
