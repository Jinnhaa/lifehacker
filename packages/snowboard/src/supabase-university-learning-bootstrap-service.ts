import { randomUUID } from "node:crypto";
import {
  buildLearningScopeKey,
  readCourseRecipeMaterialBinding,
  readCourseRecipeFromStrategyConfig,
  recommendUniversityCourseRecipe,
  snowboardLectureActionKey,
  type CourseRecipeAction,
  type CourseRecipeConfig
} from "@amber/core";
import type { UserId } from "@amber/shared";
import type { JSONValue, Sql, TransactionSql } from "postgres";
import type { SnowboardCourseProgress } from "./contracts.js";

interface CourseRow {
  id: string;
  title: string;
  strategy_config: unknown;
}

interface IdRow { id: string }
interface MaterialRow extends IdRow { stage_id: string | null; config: unknown }
interface UnitRow extends IdRow {
  exposure_state: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  understanding_state: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  validation_state: "NOT_TESTED" | "FAILED" | "PASSED";
}

export type UniversityLearningCourseBootstrapStatus =
  | "BOOTSTRAPPED"
  | "COURSE_NOT_FOUND"
  | "UNKNOWN_COURSE"
  | "INVALID_RECIPE"
  | "NO_ACTIVE_STAGE"
  | "NO_MODULE_ACTIONS";

export interface UniversityLearningCourseBootstrapResult {
  readonly courseId: string;
  readonly workContextId: string | null;
  readonly status: UniversityLearningCourseBootstrapStatus;
  readonly recipe: "BOOTSTRAPPED" | "PRESERVED" | "ABSENT" | "INVALID";
  readonly presetId: string | null;
  readonly materialsEnsured: number;
  readonly learningUnitsEnsured: number;
  readonly exposuresCompleted: number;
  readonly snowboardLectureActionKey: string | null;
}

export interface UniversityLearningBootstrapResult {
  readonly courses: readonly UniversityLearningCourseBootstrapResult[];
  readonly bootstrapped: number;
  readonly skipped: number;
  readonly materialsEnsured: number;
  readonly learningUnitsEnsured: number;
  readonly exposuresCompleted: number;
  readonly intentionallyUnmappedPresetIds: readonly string[];
}

const json = (tx: TransactionSql, value: unknown) => tx.json(value as JSONValue);

const emptyResult = (
  item: SnowboardCourseProgress,
  status: Exclude<UniversityLearningCourseBootstrapStatus, "BOOTSTRAPPED">,
  recipe: UniversityLearningCourseBootstrapResult["recipe"],
  workContextId: string | null,
  presetId: string | null
): UniversityLearningCourseBootstrapResult => ({
  courseId: item.courseId,
  workContextId,
  status,
  recipe,
  presetId,
  materialsEnsured: 0,
  learningUnitsEnsured: 0,
  exposuresCompleted: 0,
  snowboardLectureActionKey: null
});

export class SupabaseUniversityLearningBootstrapService {
  constructor(private readonly sql: Sql) {}

  async bootstrap(userId: UserId, progress: readonly SnowboardCourseProgress[]): Promise<UniversityLearningBootstrapResult> {
    const courses: UniversityLearningCourseBootstrapResult[] = [];
    for (const item of progress) courses.push(await this.bootstrapCourse(userId, item));
    const intentionallyUnmappedPresetIds = [...new Set(courses
      .filter((course) => course.status === "BOOTSTRAPPED" && course.snowboardLectureActionKey === null)
      .flatMap((course) => course.presetId ? [course.presetId] : []))].sort();
    return {
      courses,
      bootstrapped: courses.filter((course) => course.status === "BOOTSTRAPPED").length,
      skipped: courses.filter((course) => course.status !== "BOOTSTRAPPED").length,
      materialsEnsured: courses.reduce((sum, course) => sum + course.materialsEnsured, 0),
      learningUnitsEnsured: courses.reduce((sum, course) => sum + course.learningUnitsEnsured, 0),
      exposuresCompleted: courses.reduce((sum, course) => sum + course.exposuresCompleted, 0),
      intentionallyUnmappedPresetIds
    };
  }

  private bootstrapCourse(userId: UserId, item: SnowboardCourseProgress): Promise<UniversityLearningCourseBootstrapResult> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:university-learning:${item.courseId}`}))`;
      const contexts = await tx<CourseRow[]>`
        select w.id,w.title,w.strategy_config
        from public.external_references r
        join public.work_contexts w on w.id=r.internal_entity_id and w.user_id=r.user_id
        where r.user_id=${userId} and r.source='snowboard' and r.external_type='course'
          and r.external_id=${item.courseId} and r.internal_entity_type='work_context' and r.sync_status='active'
          and w.kind='course' and w.status='active' and w.archived_at is null
        for update of w`;
      if (!contexts[0]) return emptyResult(item, "COURSE_NOT_FOUND", "ABSENT", null, null);
      const context = contexts[0];
      const recipeRead = readCourseRecipeFromStrategyConfig(context.strategy_config);
      if (recipeRead.status === "INVALID") {
        return emptyResult(item, "INVALID_RECIPE", "INVALID", context.id, null);
      }
      let recipe: CourseRecipeConfig;
      let recipeStatus: UniversityLearningCourseBootstrapResult["recipe"];
      if (recipeRead.status === "VALID") {
        recipe = recipeRead.recipe;
        recipeStatus = "PRESERVED";
      } else {
        const recommended = recommendUniversityCourseRecipe(context.title);
        if (!recommended) return emptyResult(item, "UNKNOWN_COURSE", "ABSENT", context.id, null);
        recipe = recommended;
        recipeStatus = "BOOTSTRAPPED";
        await tx`update public.work_contexts
          set strategy_config=strategy_config || ${json(tx, { courseRecipe: recipe })}
          where id=${context.id} and user_id=${userId} and kind='course'`;
      }

      const stages = await tx<IdRow[]>`
        select id from public.learning_stages
        where user_id=${userId} and work_context_id=${context.id} and status='ACTIVE'
        order by position for update`;
      if (stages.length > 1) {
        return emptyResult(item, "NO_ACTIVE_STAGE", recipeStatus, context.id, recipe.presetId);
      }
      let stageId = stages[0]?.id ?? null;
      if (!stageId) {
        const existingStages = await tx<IdRow[]>`
          select id from public.learning_stages
          where user_id=${userId} and work_context_id=${context.id} and status<>'ARCHIVED'
          order by position for update`;
        if (existingStages.length) {
          return emptyResult(item, "NO_ACTIVE_STAGE", recipeStatus, context.id, recipe.presetId);
        }
        stageId = (await tx<IdRow[]>`
          insert into public.learning_stages(
            user_id,work_context_id,title,position,status,completion_mode,transition_mode,config
          ) values (
            ${userId},${context.id},'현재 학기',1,'ACTIVE','MANUAL','SEQUENTIAL',
            ${json(tx, { source: "snowboard_university_bootstrap" })}
          ) returning id`)[0]!.id;
      }
      const actions = recipe.actions.filter((action) => action.scopeType === "MODULE");
      if (!actions.length) {
        return emptyResult(item, "NO_MODULE_ACTIONS", recipeStatus, context.id, recipe.presetId);
      }
      const lectures = [...item.lectures].sort((left, right) =>
        left.position - right.position || left.moduleId.localeCompare(right.moduleId));
      if (new Set(lectures.map((lecture) => lecture.moduleId)).size !== lectures.length
        || new Set(lectures.map((lecture) => lecture.position)).size !== lectures.length) {
        throw new Error(`Snowboard course ${item.courseId} has duplicate lecture identity or position evidence`);
      }
      const scopes = lectures.map((lecture) => ({
        lecture,
        scopeKey: buildLearningScopeKey("MODULE", lecture.moduleId)
      }));
      const materialByAction = new Map<string, string>();
      for (const action of actions) {
        materialByAction.set(action.actionKey, await this.ensureMaterial(
          tx, userId, context.id, stageId, item.courseId, recipe, action, lectures.length
        ));
      }

      let nextPosition = Number((await tx<{ value: number }[]>`
        select coalesce(max(position),0)::integer+1 value from public.learning_units
        where user_id=${userId} and work_context_id=${context.id}`)[0]!.value);
      const unitByActionAndScope = new Map<string, UnitRow>();
      for (const action of actions) {
        const materialId = materialByAction.get(action.actionKey)!;
        const existing = new Map<string, UnitRow>();
        for (const scope of scopes) {
          const rows = await tx<UnitRow[]>`
            select id,exposure_state,understanding_state,validation_state
            from public.learning_units
            where user_id=${userId} and work_context_id=${context.id} and material_id=${materialId}
              and canonical_topic_key=${scope.scopeKey} for update`;
          if (rows.length > 1) throw new Error(`Duplicate Learning Units for ${materialId}/${scope.scopeKey}`);
          if (rows[0]) existing.set(scope.scopeKey, rows[0]);
        }
        for (const unit of existing.values()) {
          await tx`update public.learning_units set sequence_no=null where id=${unit.id} and user_id=${userId}`;
        }
        for (const scope of scopes) {
          const title = scope.lecture.title;
          const current = existing.get(scope.scopeKey);
          let unit: UnitRow;
          if (current) {
            await tx`update public.learning_units set title=${title},stage_id=${stageId},
              sequence_no=${scope.lecture.position},unit_type='MODULE',updated_at=now()
              where id=${current.id} and user_id=${userId} and work_context_id=${context.id}`;
            unit = current;
          } else {
            unit = (await tx<UnitRow[]>`
              insert into public.learning_units(
                user_id,work_context_id,title,position,stage_id,material_id,sequence_no,unit_type,canonical_topic_key,
                exposure_state,understanding_state,validation_state
              ) values (
                ${userId},${context.id},${title},${nextPosition},${stageId},${materialId},${scope.lecture.position},'MODULE',${scope.scopeKey},
                'NOT_STARTED','UNKNOWN','NOT_TESTED'
              ) returning id,exposure_state,understanding_state,validation_state`)[0]!;
            nextPosition += 1;
          }
          unitByActionAndScope.set(`${action.actionKey}:${scope.scopeKey}`, unit);
        }
      }

      const completionActionKey = snowboardLectureActionKey(recipe);
      let exposuresCompleted = 0;
      if (completionActionKey) {
        for (const scope of scopes) {
          if (!scope.lecture.completed) continue;
          const unit = unitByActionAndScope.get(`${completionActionKey}:${scope.scopeKey}`);
          if (!unit) throw new Error(`Mapped Snowboard lecture action is missing for ${scope.scopeKey}`);
          const updated = await tx<IdRow[]>`
            update public.learning_units set exposure_state='COMPLETE',updated_at=now()
            where id=${unit.id} and user_id=${userId} and exposure_state<>'COMPLETE'
            returning id`;
          if (!updated[0]) continue;
          exposuresCompleted += 1;
          await tx`insert into public.domain_events(
            user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,payload_version,payload
          ) values (
            ${userId},'learning_unit_updated','learning_unit',${unit.id},'system',${item.observedAt},${randomUUID()},1,
            ${json(tx, { source: "snowboard", courseId: item.courseId, moduleId: scope.lecture.moduleId,
              recipeActionKey: completionActionKey, exposureState: "COMPLETE" })}
          )`;
        }
      }
      return {
        courseId: item.courseId,
        workContextId: context.id,
        status: "BOOTSTRAPPED",
        recipe: recipeStatus,
        presetId: recipe.presetId,
        materialsEnsured: actions.length,
        learningUnitsEnsured: actions.length * scopes.length,
        exposuresCompleted,
        snowboardLectureActionKey: completionActionKey
      };
    });
  }

  private async ensureMaterial(
    tx: TransactionSql,
    userId: UserId,
    workContextId: string,
    stageId: string,
    courseId: string,
    recipe: CourseRecipeConfig,
    action: CourseRecipeAction,
    moduleCount: number
  ): Promise<string> {
    const rows = await tx<MaterialRow[]>`
      select id,stage_id,config from public.learning_materials
      where user_id=${userId} and work_context_id=${workContextId}
        and config->>'presetId'=${recipe.presetId}
        and config->>'presetVersion'=${String(recipe.presetVersion)}
        and config->>'recipeActionKey'=${action.actionKey}
      for update`;
    if (rows.length > 1) throw new Error(`Duplicate CourseRecipe material for ${recipe.presetId}/${action.actionKey}`);
    if (rows[0]) {
      const binding = readCourseRecipeMaterialBinding(rows[0].config);
      if (!binding || binding.recipePhase !== action.phase) {
        throw new Error(`Invalid CourseRecipe material binding for ${recipe.presetId}/${action.actionKey}`);
      }
      if (rows[0].stage_id !== stageId) {
        throw new Error(`CourseRecipe material ${action.actionKey} does not belong to the active stage`);
      }
      await tx`update public.learning_materials set total_units=${moduleCount || null},
        start_unit=${moduleCount ? 1 : null},status='ACTIVE',updated_at=now()
        where id=${rows[0].id} and user_id=${userId}`;
      return rows[0].id;
    }
    const config = {
      recipeActionKey: action.actionKey,
      recipePhase: action.phase,
      presetId: recipe.presetId,
      presetVersion: recipe.presetVersion
    };
    return (await tx<IdRow[]>`
      insert into public.learning_materials(
        user_id,work_context_id,stage_id,title,material_type,role,tracking_mode,unit_type,
        total_units,start_unit,status,source_reference,config
      ) values (
        ${userId},${workContextId},${stageId},${action.label},'course_recipe_action',${action.phase},'LEARNING_STATE','MODULE',
        ${moduleCount || null},${moduleCount ? 1 : null},'ACTIVE',${json(tx, { source: "snowboard", courseId })},${json(tx, config)}
      ) returning id`)[0]!.id;
  }
}
