import type { UserId } from "@amber/shared";
export type ContextKind = "project" | "course" | "certification";
export type CommitmentLevel = "REQUIRED" | "IMPORTANT" | "OPTIONAL";
export type CertificationStudyMode = "CUMULATIVE" | "MIXED" | "CRAMMABLE";
export type ProjectType = "SPRINT" | "ONGOING" | "PERSONAL";
export interface ContextCommonInput {
    readonly title: string;
    readonly description?: string | null;
    readonly strategicImportance?: number | null;
    readonly commitmentLevel?: CommitmentLevel | null;
    readonly startDate?: string | null;
    readonly endDate?: string | null;
    readonly internalStartDate?: string | null;
}
export interface CourseProfileInput {
    readonly targetGrade?: string | null;
    readonly term?: string | null;
    readonly instructor?: string | null;
}
export interface CertificationProfileInput {
    readonly targetOutcome?: string | null;
    readonly examDate?: string | null;
    readonly studyMode?: CertificationStudyMode | null;
    readonly currentLevel?: string | null;
}
export interface ProjectStrategyInput {
    readonly projectType?: ProjectType | null;
    readonly reviewCadenceDays?: number | null;
    readonly displaceable?: boolean;
}
export interface ContextRecord {
    readonly id: string;
    readonly userId: UserId;
    readonly kind: ContextKind;
    readonly title: string;
    readonly description: string | null;
    readonly strategicImportance: number | null;
    readonly commitmentLevel: CommitmentLevel | null;
    readonly startDate: string | null;
    readonly endDate: string | null;
    readonly internalStartDate: string | null;
    readonly strategyConfig: ProjectStrategyInput;
}
export interface CourseContextRecord extends ContextRecord {
    readonly kind: "course";
    readonly targetGrade: string | null;
    readonly term: string | null;
    readonly instructor: string | null;
}
export interface CertificationContextRecord extends ContextRecord {
    readonly kind: "certification";
    readonly targetOutcome: string | null;
    readonly examDate: string | null;
    readonly studyMode: CertificationStudyMode | null;
    readonly currentLevel: string | null;
}
export interface ProjectContextRecord extends ContextRecord {
    readonly kind: "project";
}
export interface ContextManagementRepository {
    listCourses(userId: UserId): Promise<readonly CourseContextRecord[]>;
    listCertifications(userId: UserId): Promise<readonly CertificationContextRecord[]>;
    listProjects(userId: UserId): Promise<readonly ProjectContextRecord[]>;
    createCourse(userId: UserId, context: ContextCommonInput, profile: CourseProfileInput): Promise<string>;
    createCertification(userId: UserId, context: ContextCommonInput, profile: CertificationProfileInput): Promise<string>;
    createProject(userId: UserId, context: ContextCommonInput, strategy: ProjectStrategyInput): Promise<string>;
    updateCourse(userId: UserId, contextId: string, context: ContextCommonInput, profile: CourseProfileInput): Promise<void>;
    updateCertification(userId: UserId, contextId: string, context: ContextCommonInput, profile: CertificationProfileInput): Promise<void>;
    updateProject(userId: UserId, contextId: string, context: ContextCommonInput, strategy: ProjectStrategyInput): Promise<void>;
    archive(userId: UserId, contextId: string, expectedKind: ContextKind): Promise<void>;
}
export declare class ContextManagementService {
    private readonly repository;
    constructor(repository: ContextManagementRepository);
    listLearning(userId: UserId): Promise<[readonly CourseContextRecord[], readonly CertificationContextRecord[]]>;
    listProjects(userId: UserId): Promise<readonly ProjectContextRecord[]>;
    createCourse(userId: UserId, context: ContextCommonInput, profile: CourseProfileInput): Promise<string>;
    createCertification(userId: UserId, context: ContextCommonInput, profile: CertificationProfileInput): Promise<string>;
    createProject(userId: UserId, context: ContextCommonInput, strategy: ProjectStrategyInput): Promise<string>;
    updateCourse(userId: UserId, contextId: string, context: ContextCommonInput, profile: CourseProfileInput): Promise<void>;
    updateCertification(userId: UserId, contextId: string, context: ContextCommonInput, profile: CertificationProfileInput): Promise<void>;
    updateProject(userId: UserId, contextId: string, context: ContextCommonInput, strategy: ProjectStrategyInput): Promise<void>;
    archive(userId: UserId, contextId: string, expectedKind: ContextKind): Promise<void>;
}
//# sourceMappingURL=context-management.d.ts.map