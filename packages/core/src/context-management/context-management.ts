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

const allowedCommitments = new Set<CommitmentLevel>(["REQUIRED", "IMPORTANT", "OPTIONAL"]);
const allowedStudyModes = new Set<CertificationStudyMode>(["CUMULATIVE", "MIXED", "CRAMMABLE"]);
const allowedProjectTypes = new Set<ProjectType>(["SPRINT", "ONGOING", "PERSONAL"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const validateDate = (value: string | null | undefined, label: string): void => {
  if (value && (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
    throw new Error(`${label}을 확인해 주세요.`);
  }
};

const validateCommon = (input: ContextCommonInput): void => {
  if (!input.title.trim()) throw new Error("제목을 입력해 주세요.");
  if (input.title.trim().length > 300) throw new Error("제목은 300자 이하로 입력해 주세요.");
  if (input.strategicImportance !== null && input.strategicImportance !== undefined
    && (!Number.isInteger(input.strategicImportance) || input.strategicImportance < 1 || input.strategicImportance > 5)) {
    throw new Error("전략 중요도는 1부터 5까지 입력해 주세요.");
  }
  if (input.commitmentLevel && !allowedCommitments.has(input.commitmentLevel)) {
    throw new Error("Commitment level을 확인해 주세요.");
  }
  validateDate(input.startDate, "시작일");
  validateDate(input.endDate, "종료일");
  validateDate(input.internalStartDate, "내부 시작일");
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
  }
};

const validateCertification = (profile: CertificationProfileInput): void => {
  validateDate(profile.examDate, "시험일");
  if (profile.studyMode && !allowedStudyModes.has(profile.studyMode)) {
    throw new Error("학습 방식을 확인해 주세요.");
  }
};

const validateProject = (strategy: ProjectStrategyInput): void => {
  if (strategy.projectType && !allowedProjectTypes.has(strategy.projectType)) {
    throw new Error("프로젝트 유형을 확인해 주세요.");
  }
  if (strategy.reviewCadenceDays !== null && strategy.reviewCadenceDays !== undefined
    && (!Number.isInteger(strategy.reviewCadenceDays) || strategy.reviewCadenceDays <= 0)) {
    throw new Error("검토 주기는 1일 이상의 정수로 입력해 주세요.");
  }
};

export class ContextManagementService {
  constructor(private readonly repository: ContextManagementRepository) {}

  listLearning(userId: UserId) {
    return Promise.all([this.repository.listCourses(userId), this.repository.listCertifications(userId)]);
  }

  listProjects(userId: UserId) {
    return this.repository.listProjects(userId);
  }

  createCourse(userId: UserId, context: ContextCommonInput, profile: CourseProfileInput) {
    validateCommon(context);
    return this.repository.createCourse(userId, context, profile);
  }

  createCertification(userId: UserId, context: ContextCommonInput, profile: CertificationProfileInput) {
    validateCommon(context);
    validateCertification(profile);
    return this.repository.createCertification(userId, context, profile);
  }

  createProject(userId: UserId, context: ContextCommonInput, strategy: ProjectStrategyInput) {
    validateCommon(context);
    validateProject(strategy);
    return this.repository.createProject(userId, context, strategy);
  }

  updateCourse(userId: UserId, contextId: string, context: ContextCommonInput, profile: CourseProfileInput) {
    validateCommon(context);
    return this.repository.updateCourse(userId, contextId, context, profile);
  }

  updateCertification(userId: UserId, contextId: string, context: ContextCommonInput, profile: CertificationProfileInput) {
    validateCommon(context);
    validateCertification(profile);
    return this.repository.updateCertification(userId, contextId, context, profile);
  }

  updateProject(userId: UserId, contextId: string, context: ContextCommonInput, strategy: ProjectStrategyInput) {
    validateCommon(context);
    validateProject(strategy);
    return this.repository.updateProject(userId, contextId, context, strategy);
  }

  archive(userId: UserId, contextId: string, expectedKind: ContextKind) {
    return this.repository.archive(userId, contextId, expectedKind);
  }
}
