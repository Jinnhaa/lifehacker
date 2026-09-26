import "server-only";

import { ContextManagementService, SupabaseContextManagementRepository } from "@amber/core";
import type { Sql } from "postgres";
import { getWebSql, getWebUserId } from "./web-runtime";
import type { LearningContextsViewModel, ProjectContextsViewModel } from "./context-management-types";

export const createWebContextManagementService = (sql: Sql) => new ContextManagementService(
  new SupabaseContextManagementRepository(sql)
);

export const loadLearningContexts = async (): Promise<LearningContextsViewModel> => {
  try {
    const [courses, certifications] = await createWebContextManagementService(getWebSql()).listLearning(getWebUserId());
    return { configured: true, error: null, courses, certifications };
  } catch (error) {
    return { configured: false, error: error instanceof Error ? error.message : "학습 Context를 불러오지 못했습니다.", courses: [], certifications: [] };
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
