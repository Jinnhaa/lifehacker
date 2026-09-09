import { DomainError, FixedClock } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { AiTaskExecutionService } from "./ai-task-execution-service.js";
const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "10000000-0000-4000-8000-000000000002";
const stepId = "10000000-0000-4000-8000-000000000003";
const projectId = "10000000-0000-4000-8000-000000000004";
const scopeId = "10000000-0000-4000-8000-000000000005";
const objectiveId = "10000000-0000-4000-8000-000000000006";
const now = new Date("2026-09-09T06:00:00.000Z");
const target = (overrides = {}) => ({
    userId, taskStepId: stepId, taskId, workContextId: projectId, scopeId, owner: "ai", status: "pending",
    taskStatus: "INBOX", skillKey: "document-draft", ...overrides
});
const context = (overrides = {}) => ({
    userId, project: { id: projectId, userId, scopeId, title: "LogFolio", description: "Portfolio", status: "active", startDate: null, endDate: null },
    observedAt: now, planDate: "2026-09-09", timeZone: "Asia/Seoul",
    objectives: [{ id: objectiveId, title: "Ship", goalId: null, targetDate: null, successCriteria: "Published", importance: 5, status: "active" }], goals: [],
    tasks: [{ id: taskId, userId, workContextId: projectId, objectiveId, title: "Acceptance criteria", description: null,
            executionMode: "output_focused", officialDeadline: null, internalDeadline: null, estimatedMinutes: 30,
            estimatedUserMinutes: 0, actualMinutes: 0, importance: 5, status: "INBOX", nextAction: null,
            completionCriteria: "criterion-a", completionSource: null, createdAt: now, completedAt: null, updatedAt: now }],
    taskSteps: [{ id: stepId, taskId, position: 1, title: "Draft", owner: "ai", estimatedMinutes: 30,
            completionCriteria: "criterion-a", status: "pending", skillKey: "document-draft" }],
    artifacts: [], decisions: [], sourceReferences: [], activeFocus: null, approvedPlanTasks: [], recentEvents: [], ...overrides
});
const validOutput = () => ({
    title: "Draft", summary: "Summary", body: "Body", addressedCriteria: ["criterion-a"],
    sourceRefs: [`task_step:${stepId}`], uncertainties: []
});
class MemoryRepository {
    targetValue;
    attempts = [];
    completed = null;
    failures = [];
    blocked = 0;
    constructor(targetValue = target()) {
        this.targetValue = targetValue;
    }
    async loadTarget() { return this.targetValue; }
    async findSuccessful() { return this.completed; }
    async startAttempt() {
        const number = this.attempts.length + 1;
        const attempt = { kind: "started", workflowRunId: `20000000-0000-4000-8000-00000000000${number}`, agentRunId: `30000000-0000-4000-8000-00000000000${number}`, contextPackageId: `40000000-0000-4000-8000-00000000000${number}`, attemptNumber: number };
        this.attempts.push(attempt);
        return attempt;
    }
    async completeAttempt(input) { this.completed = { agentRunId: input.attempt.agentRunId, artifactId: "50000000-0000-4000-8000-000000000001" }; return this.completed.artifactId; }
    async failAttempt(input) { this.failures.push({ terminal: input.terminal }); }
    async blockWithoutAttempt() { this.blocked += 1; }
}
const setup = (options = {}) => {
    const repository = new MemoryRepository(options.target ?? target());
    const projectContext = options.projectContext ?? context();
    const projectRepository = {
        listProjects: vi.fn(async () => [projectContext.project]), loadProjectContext: vi.fn(async () => projectContext)
    };
    const queue = [...(options.outputs ?? [validOutput()])];
    const executor = { executeDocumentDraft: vi.fn(async () => {
            const result = queue.shift();
            if (result instanceof Error)
                throw result;
            return result;
        }) };
    const service = new AiTaskExecutionService({ repository, projectRepository, executor, clock: new FixedClock(now) });
    return { service, repository, executor };
};
describe("AI TaskStep execution", () => {
    it("executes only an AI-owned step whose dependencies are resolved", async () => {
        const ready = setup();
        await expect(ready.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" })).resolves.toMatchObject({ status: "waiting_for_review" });
        expect(ready.executor.executeDocumentDraft).toHaveBeenCalledOnce();
        const waiting = setup({ target: target({ status: "dependency_waiting" }) });
        await expect(waiting.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(waiting.executor.executeDocumentDraft).not.toHaveBeenCalled();
    });
    it("never executes a human-owned step", async () => {
        const subject = setup({ target: target({ owner: "user", skillKey: null }) });
        await expect(subject.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(subject.executor.executeDocumentDraft).not.toHaveBeenCalled();
    });
    it("leaves one AgentRun attempt and a verified review artifact on success", async () => {
        const subject = setup();
        const result = await subject.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" });
        expect(result).toMatchObject({ status: "waiting_for_review", attemptNumber: 1 });
        expect(subject.repository.attempts).toHaveLength(1);
        expect(subject.repository.completed).not.toBeNull();
    });
    it("does not persist an Artifact when verification fails", async () => {
        const invalid = { ...validOutput(), addressedCriteria: ["something-else"] };
        const subject = setup({ outputs: [invalid, invalid] });
        await expect(subject.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" })).resolves.toEqual({ status: "blocked" });
        expect(subject.repository.completed).toBeNull();
    });
    it("reuses the successful execution without another AgentRun or Artifact", async () => {
        const subject = setup();
        await subject.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" });
        const result = await subject.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" });
        expect(result.status).toBe("reused");
        expect(subject.repository.attempts).toHaveLength(1);
    });
    it("uses a new AgentRun for a retryable failure", async () => {
        const subject = setup({ outputs: [new DomainError("PARSE_FAILED", "transient"), validOutput()] });
        const result = await subject.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" });
        expect(result).toMatchObject({ status: "waiting_for_review", attemptNumber: 2 });
        expect(subject.repository.attempts).toHaveLength(2);
        expect(subject.repository.failures).toEqual([{ terminal: false }]);
    });
    it("blocks after max retry and immediately on non-retryable failure", async () => {
        const retry = setup({ outputs: [new DomainError("PARSE_FAILED", "one"), new DomainError("PARSE_FAILED", "two")] });
        await expect(retry.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" })).resolves.toEqual({ status: "blocked" });
        expect(retry.repository.failures).toEqual([{ terminal: false }, { terminal: true }]);
        const fatal = setup({ outputs: [new DomainError("INVALID_INPUT", "scope violation")] });
        await expect(fatal.service.dispatch({ userId, taskStepId: stepId, timeZone: "Asia/Seoul" })).resolves.toEqual({ status: "blocked" });
        expect(fatal.repository.attempts).toHaveLength(1);
        expect(fatal.repository.failures).toEqual([{ terminal: true }]);
    });
});
//# sourceMappingURL=ai-task-execution-service.test.js.map