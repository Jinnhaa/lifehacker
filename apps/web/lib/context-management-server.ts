import "server-only";

import { ContextManagementService, SupabaseContextManagementRepository, LearningUnitService, SupabaseLearningUnitRepository, summarizeLearningUnits } from "@amber/core";
import type { Sql } from "postgres";
import { getWebSql, getWebUserId } from "./web-runtime";
import type { LearningContextsViewModel, ProjectContextsViewModel } from "./context-management-types";

export const createWebContextManagementService = (sql: Sql) => new ContextManagementService(
  new SupabaseContextManagementRepository(sql)
);
export const createWebLearningUnitService = (sql: Sql) => new LearningUnitService(new SupabaseLearningUnitRepository(sql));

export const loadLearningContexts = async (): Promise<LearningContextsViewModel> => {
  try {
    const sql = getWebSql();
    const userId = getWebUserId();
    const [[courses, certifications], allUnits] = await Promise.all([
      createWebContextManagementService(sql).listLearning(userId), createWebLearningUnitService(sql).list(userId)
    ]);
    const learningUnits = Object.fromEntries([...courses, ...certifications].map((context) => {
      const units = allUnits.filter((unit) => unit.workContextId === context.id);
      return [context.id, { units, summary: summarizeLearningUnits(units) }];
    }));
    return { configured: true, error: null, courses, certifications, learningUnits };
  } catch (error) {
    return { configured: false, error: error instanceof Error ? error.message : "학습 Context를 불러오지 못했습니다.", courses: [], certifications: [], learningUnits: {} };
  }
};

export const loadProjectContexts = async (): Promise<ProjectContextsViewModel> => {
  try {
    const projects = await createWebContextManagementService(getWebSql()).listProjects(getWebUserId());
    return { configured: true, error: null, projects };
  } catch (error) {
    return { configured: false, error: error instanceof Error ? error.message : "Project Context를 불러오지 못했습니다.", projects: [] };
  }
};
