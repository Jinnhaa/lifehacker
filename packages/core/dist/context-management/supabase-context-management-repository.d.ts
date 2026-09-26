import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { CertificationContextRecord, CertificationProfileInput, ContextCommonInput, ContextKind, ContextManagementRepository, CourseContextRecord, CourseProfileInput, ProjectContextRecord, ProjectStrategyInput } from "./context-management.js";
export declare class SupabaseContextManagementRepository implements ContextManagementRepository {
    private readonly sql;
    constructor(sql: Sql);
    listCourses(userId: UserId): Promise<readonly CourseContextRecord[]>;
    listCertifications(userId: UserId): Promise<readonly CertificationContextRecord[]>;
    listProjects(userId: UserId): Promise<readonly ProjectContextRecord[]>;
    createCourse(userId: UserId, context: ContextCommonInput, profile: CourseProfileInput): Promise<string>;
    createCertification(userId: UserId, context: ContextCommonInput, profile: CertificationProfileInput): Promise<string>;
    createProject(userId: UserId, context: ContextCommonInput, projectStrategy: ProjectStrategyInput): Promise<string>;
    updateCourse(userId: UserId, contextId: string, context: ContextCommonInput, profile: CourseProfileInput): Promise<void>;
    updateCertification(userId: UserId, contextId: string, context: ContextCommonInput, profile: CertificationProfileInput): Promise<void>;
    updateProject(userId: UserId, contextId: string, context: ContextCommonInput, projectStrategy: ProjectStrategyInput): Promise<void>;
    archive(userId: UserId, contextId: string, expectedKind: ContextKind): Promise<void>;
}
//# sourceMappingURL=supabase-context-management-repository.d.ts.map