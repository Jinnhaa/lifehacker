const allowedCommitments = new Set(["REQUIRED", "IMPORTANT", "OPTIONAL"]);
const allowedStudyModes = new Set(["CUMULATIVE", "MIXED", "CRAMMABLE"]);
const allowedProjectTypes = new Set(["SPRINT", "ONGOING", "PERSONAL"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validateDate = (value, label) => {
    if (value && (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
        throw new Error(`${label}을 확인해 주세요.`);
    }
};
const validateCommon = (input) => {
    if (!input.title.trim())
        throw new Error("제목을 입력해 주세요.");
    if (input.title.trim().length > 300)
        throw new Error("제목은 300자 이하로 입력해 주세요.");
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
const validateCertification = (profile) => {
    validateDate(profile.examDate, "시험일");
    if (profile.studyMode && !allowedStudyModes.has(profile.studyMode)) {
        throw new Error("학습 방식을 확인해 주세요.");
    }
};
const validateProject = (strategy) => {
    if (strategy.projectType && !allowedProjectTypes.has(strategy.projectType)) {
        throw new Error("프로젝트 유형을 확인해 주세요.");
    }
    if (strategy.reviewCadenceDays !== null && strategy.reviewCadenceDays !== undefined
        && (!Number.isInteger(strategy.reviewCadenceDays) || strategy.reviewCadenceDays <= 0)) {
        throw new Error("검토 주기는 1일 이상의 정수로 입력해 주세요.");
    }
};
export class ContextManagementService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    listLearning(userId) {
        return Promise.all([this.repository.listCourses(userId), this.repository.listCertifications(userId)]);
    }
    listProjects(userId) {
        return this.repository.listProjects(userId);
    }
    createCourse(userId, context, profile) {
        validateCommon(context);
        return this.repository.createCourse(userId, context, profile);
    }
    createCertification(userId, context, profile) {
        validateCommon(context);
        validateCertification(profile);
        return this.repository.createCertification(userId, context, profile);
    }
    createProject(userId, context, strategy) {
        validateCommon(context);
        validateProject(strategy);
        return this.repository.createProject(userId, context, strategy);
    }
    updateCourse(userId, contextId, context, profile) {
        validateCommon(context);
        return this.repository.updateCourse(userId, contextId, context, profile);
    }
    updateCertification(userId, contextId, context, profile) {
        validateCommon(context);
        validateCertification(profile);
        return this.repository.updateCertification(userId, contextId, context, profile);
    }
    updateProject(userId, contextId, context, strategy) {
        validateCommon(context);
        validateProject(strategy);
        return this.repository.updateProject(userId, contextId, context, strategy);
    }
    archive(userId, contextId, expectedKind) {
        return this.repository.archive(userId, contextId, expectedKind);
    }
}
//# sourceMappingURL=context-management.js.map