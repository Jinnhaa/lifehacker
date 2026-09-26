import { describe, expect, it, vi } from "vitest";
import { ContextManagementService } from "./context-management.js";
const userId = "10000000-0000-4000-8000-000000000001";
const repository = () => ({
    listCourses: vi.fn(async () => []), listCertifications: vi.fn(async () => []), listProjects: vi.fn(async () => []),
    createCourse: vi.fn(async () => "course"), createCertification: vi.fn(async () => "certification"),
    createProject: vi.fn(async () => "project"), updateCourse: vi.fn(async () => undefined),
    updateCertification: vi.fn(async () => undefined), updateProject: vi.fn(async () => undefined),
    archive: vi.fn(async () => undefined)
});
describe("ContextManagementService validation", () => {
    it("rejects strategic importance outside 1 through 5", async () => {
        const repo = repository();
        expect(() => new ContextManagementService(repo).createCourse(userId, { title: "DB", strategicImportance: 6 }, {}))
            .toThrow("전략 중요도");
        expect(repo.createCourse).not.toHaveBeenCalled();
    });
    it("rejects an unknown commitment level", async () => {
        const repo = repository();
        expect(() => new ContextManagementService(repo).createCourse(userId, { title: "DB", commitmentLevel: "CASUAL" }, {})).toThrow("Commitment");
        expect(repo.createCourse).not.toHaveBeenCalled();
    });
    it("rejects an unknown certification study mode", async () => {
        const repo = repository();
        expect(() => new ContextManagementService(repo).createCertification(userId, { title: "SQLD" }, { studyMode: "WEEKEND" })).toThrow("학습 방식");
        expect(repo.createCertification).not.toHaveBeenCalled();
    });
    it("rejects a non-positive project review cadence", async () => {
        const repo = repository();
        expect(() => new ContextManagementService(repo).createProject(userId, { title: "Launch" }, { projectType: "SPRINT", reviewCadenceDays: 0, displaceable: false })).toThrow("검토 주기");
        expect(repo.createProject).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=context-management.test.js.map