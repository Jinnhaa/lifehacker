import { UNIVERSITY_COURSE_RECIPE_PRESETS } from "@amber/core";
import type { UserId } from "@amber/shared";
import type { Sql, TransactionSql } from "postgres";
import { describe, expect, it } from "vitest";
import type { SnowboardCourseProgress } from "./contracts.js";
import { SupabaseUniversityLearningBootstrapService } from "./supabase-university-learning-bootstrap-service.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;

interface MaterialState {
  id: string;
  actionKey: string;
  stageId: string;
  config: unknown;
}

interface UnitState {
  id: string;
  materialId: string;
  scopeKey: string;
  sequenceNo: number | null;
  title: string;
  exposureState: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  understandingState: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  validationState: "NOT_TESTED" | "FAILED" | "PASSED";
}

interface MockState {
  kind: "course" | "certification";
  title: string;
  strategyConfig: Record<string, unknown>;
  activeStageIds: string[];
  materials: Map<string, MaterialState>;
  units: Map<string, UnitState>;
  statements: string[];
  events: number;
}

const progress = (position = 1, completed = true): SnowboardCourseProgress => ({
  courseId: "101",
  courseTitle: "데이터베이스 (001)",
  completedLectureCount: completed ? 1 : 0,
  remainingLectureCount: completed ? 0 : 1,
  remainingLectureMinutes: completed ? 0 : 30,
  lectures: [{ moduleId: "2043101", position, title: "관계형 데이터 모델", completed, estimatedMinutes: 30 }],
  observedAt: new Date("2026-10-06T00:00:00Z")
});

const createState = (overrides: Partial<MockState> = {}): MockState => ({
  kind: "course",
  title: "데이터베이스 (001)",
  strategyConfig: {},
  activeStageIds: ["stage"],
  materials: new Map(),
  units: new Map(),
  statements: [],
  events: 0,
  ...overrides
});

const mockSql = (state: MockState): Sql => {
  let materialSequence = 0;
  let unitSequence = 0;
  const transaction = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?").replaceAll(/\s+/gu, " ").trim();
    state.statements.push(query);
    if (query.includes("pg_advisory_xact_lock")) return [];
    if (query.includes("from public.external_references r") && query.includes("for update of w")) {
      return state.kind === "course"
        ? [{ id: "context", title: state.title, strategy_config: state.strategyConfig }]
        : [];
    }
    if (query.startsWith("update public.work_contexts")) {
      const update = values[0] as { courseRecipe: unknown };
      state.strategyConfig = { ...state.strategyConfig, courseRecipe: update.courseRecipe };
      return { count: 1 };
    }
    if (query.includes("select id from public.learning_stages")) {
      return state.activeStageIds.map((id) => ({ id }));
    }
    if (query.includes("select id,stage_id,config from public.learning_materials")) {
      const material = state.materials.get(String(values[4]));
      return material ? [{ id: material.id, stage_id: material.stageId, config: material.config }] : [];
    }
    if (query.startsWith("insert into public.learning_materials")) {
      const config = values[8] as { recipeActionKey: string };
      const material = {
        id: `material-${++materialSequence}`, actionKey: config.recipeActionKey,
        stageId: String(values[2]), config
      };
      state.materials.set(config.recipeActionKey, material);
      return [{ id: material.id }];
    }
    if (query.startsWith("update public.learning_materials")) return { count: 1 };
    if (query.includes("select coalesce(max(position),0)::integer+1 value")) {
      return [{ value: state.units.size + 1 }];
    }
    if (query.includes("from public.learning_units") && query.includes("canonical_topic_key=? for update")) {
      const key = `${String(values[2])}:${String(values[3])}`;
      const unit = state.units.get(key);
      return unit ? [{
        id: unit.id,
        exposure_state: unit.exposureState,
        understanding_state: unit.understandingState,
        validation_state: unit.validationState
      }] : [];
    }
    if (query.startsWith("update public.learning_units set sequence_no=null")) {
      const unit = [...state.units.values()].find((candidate) => candidate.id === values[0]);
      if (unit) unit.sequenceNo = null;
      return { count: unit ? 1 : 0 };
    }
    if (query.startsWith("update public.learning_units set title=")) {
      const unit = [...state.units.values()].find((candidate) => candidate.id === values[3]);
      if (unit) {
        unit.title = String(values[0]);
        unit.sequenceNo = Number(values[2]);
      }
      return { count: unit ? 1 : 0 };
    }
    if (query.startsWith("insert into public.learning_units")) {
      const unit: UnitState = {
        id: `unit-${++unitSequence}`,
        materialId: String(values[5]),
        scopeKey: String(values[7]),
        sequenceNo: Number(values[6]),
        title: String(values[2]),
        exposureState: "NOT_STARTED",
        understandingState: "UNKNOWN",
        validationState: "NOT_TESTED"
      };
      state.units.set(`${unit.materialId}:${unit.scopeKey}`, unit);
      return [{
        id: unit.id,
        exposure_state: unit.exposureState,
        understanding_state: unit.understandingState,
        validation_state: unit.validationState
      }];
    }
    if (query.startsWith("update public.learning_units set exposure_state='COMPLETE'")) {
      const unit = [...state.units.values()].find((candidate) => candidate.id === values[0]);
      if (!unit || unit.exposureState === "COMPLETE") return [];
      unit.exposureState = "COMPLETE";
      return [{ id: unit.id }];
    }
    if (query.startsWith("insert into public.domain_events")) {
      state.events += 1;
      return { count: 1 };
    }
    throw new Error(`Unhandled SQL: ${query}`);
  }, { json: (value: unknown) => value }) as unknown as TransactionSql;
  return Object.assign(transaction, {
    begin: async <T>(callback: (tx: TransactionSql) => Promise<T>): Promise<T> => callback(transaction)
  }) as unknown as Sql;
};

describe("University Learning bootstrap from Snowboard MODULE reality", () => {
  it("bootstraps concept_sql cells idempotently and projects only lecture Exposure monotonically", async () => {
    const state = createState({ strategyConfig: { keep: true } });
    const service = new SupabaseUniversityLearningBootstrapService(mockSql(state));

    const first = await service.bootstrap(userId, [progress()]);
    expect(first.courses[0]).toMatchObject({
      status: "BOOTSTRAPPED", recipe: "BOOTSTRAPPED", presetId: "concept_sql",
      snowboardLectureActionKey: "lecture", exposuresCompleted: 1
    });
    expect((state.strategyConfig.courseRecipe as { presetId: string }).presetId).toBe("concept_sql");
    expect(state.strategyConfig.keep).toBe(true);
    expect(state.materials.size).toBe(UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql.actions.length);
    expect(state.units.size).toBe(UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql.actions.length);

    const lectureMaterial = state.materials.get("lecture")!;
    const lectureUnit = state.units.get(`${lectureMaterial.id}:module:2043101`)!;
    const originalUnitIds = [...state.units.values()].map((unit) => unit.id).sort();
    expect(lectureUnit).toMatchObject({
      exposureState: "COMPLETE", understandingState: "UNKNOWN", validationState: "NOT_TESTED",
      sequenceNo: 1
    });
    for (const [actionKey, material] of state.materials) {
      if (actionKey === "lecture") continue;
      expect(state.units.get(`${material.id}:module:2043101`)).toMatchObject({
        exposureState: "NOT_STARTED", understandingState: "UNKNOWN", validationState: "NOT_TESTED"
      });
    }

    const repeated = await service.bootstrap(userId, [progress()]);
    expect(repeated.exposuresCompleted).toBe(0);
    expect([...state.units.values()].map((unit) => unit.id).sort()).toEqual(originalUnitIds);
    expect(state.units.size).toBe(UNIVERSITY_COURSE_RECIPE_PRESETS.concept_sql.actions.length);

    await service.bootstrap(userId, [progress(3, false)]);
    expect(state.units.get(`${lectureMaterial.id}:module:2043101`)).toMatchObject({
      id: lectureUnit.id, sequenceNo: 3, exposureState: "COMPLETE",
      understandingState: "UNKNOWN", validationState: "NOT_TESTED"
    });
    expect(state.events).toBe(1);
  });

  it("preserves an existing valid Recipe exactly and leaves unmapped presets unprojected", async () => {
    const existingRecipe = {
      ...UNIVERSITY_COURSE_RECIPE_PRESETS.coding_practice,
      userModified: true
    };
    const strategyConfig = { keep: "value", courseRecipe: existingRecipe };
    const state = createState({ title: "프로그래밍방법론", strategyConfig });
    const result = await new SupabaseUniversityLearningBootstrapService(mockSql(state)).bootstrap(userId, [progress()]);

    expect(result.courses[0]).toMatchObject({
      status: "BOOTSTRAPPED", recipe: "PRESERVED", presetId: "coding_practice",
      snowboardLectureActionKey: null, exposuresCompleted: 0
    });
    expect(state.strategyConfig).toEqual(strategyConfig);
    expect(result.intentionallyUnmappedPresetIds).toEqual(["coding_practice"]);
    expect([...state.units.values()].every((unit) => unit.exposureState === "NOT_STARTED")).toBe(true);
    expect(state.statements.some((query) => query.startsWith("update public.work_contexts"))).toBe(false);
  });

  it("fails closed for invalid or unknown Recipe evidence", async () => {
    const invalid = createState({ strategyConfig: { courseRecipe: { presetId: "broken" } } });
    const invalidResult = await new SupabaseUniversityLearningBootstrapService(mockSql(invalid)).bootstrap(userId, [progress()]);
    expect(invalidResult.courses[0]).toMatchObject({ status: "INVALID_RECIPE", recipe: "INVALID" });
    expect(invalid.materials.size).toBe(0);
    expect(invalid.units.size).toBe(0);

    const unknown = createState({ title: "알 수 없는 과목" });
    const unknownResult = await new SupabaseUniversityLearningBootstrapService(mockSql(unknown)).bootstrap(userId, [progress()]);
    expect(unknownResult.courses[0]).toMatchObject({ status: "UNKNOWN_COURSE", recipe: "ABSENT" });
    expect(unknown.strategyConfig).toEqual({});
    expect(unknown.materials.size).toBe(0);
  });

  it("never bootstraps a Certification context and fails closed without one active stage", async () => {
    const certification = createState({ kind: "certification" });
    const certificationResult = await new SupabaseUniversityLearningBootstrapService(mockSql(certification)).bootstrap(userId, [progress()]);
    expect(certificationResult.courses[0]?.status).toBe("COURSE_NOT_FOUND");
    expect(certification.statements.find((query) => query.includes("from public.external_references r"))).toContain("w.kind='course'");
    expect(certification.materials.size).toBe(0);

    const noStage = createState({ activeStageIds: [] });
    const noStageResult = await new SupabaseUniversityLearningBootstrapService(mockSql(noStage)).bootstrap(userId, [progress()]);
    expect(noStageResult.courses[0]).toMatchObject({ status: "NO_ACTIVE_STAGE", recipe: "BOOTSTRAPPED" });
    expect(noStage.materials.size).toBe(0);
  });
});
