import { createHash } from "node:crypto";
import { DomainError } from "@amber/shared";
import { documentDraftSkill, projectLeadershipSkillRegistry } from "../project-leadership/skill-registry.js";
import { createExecutionContext } from "./ai-task-execution.js";
const MAX_ATTEMPTS = 2;
const stableHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const localDate = (value, timeZone) => {
    const fields = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const read = (type) => fields.find((field) => field.type === type)?.value ?? "";
    return `${read("year")}-${read("month")}-${read("day")}`;
};
export class AiTaskExecutionService {
    dependencies;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async dispatch(input) {
        const target = await this.dependencies.repository.loadTarget(input.userId, input.taskStepId);
        if (!target)
            throw new DomainError("INVALID_INPUT", "TaskStep is not available for AI execution");
        if (target.owner !== "ai")
            throw new DomainError("INVALID_INPUT", "Human-owned TaskStep cannot be executed by AI");
        if (target.status === "dependency_waiting")
            throw new DomainError("CONFLICT", "TaskStep dependencies are unresolved");
        if (!["pending", "in_progress", "waiting_for_review"].includes(target.status)) {
            throw new DomainError("CONFLICT", "TaskStep is not executable", { status: target.status });
        }
        if (!target.skillKey || !(target.skillKey in projectLeadershipSkillRegistry) || target.skillKey !== documentDraftSkill.key) {
            await this.dependencies.repository.blockWithoutAttempt({ target, code: "MISSING_SKILL", reason: "No supported Skill is assigned", now: this.dependencies.clock.now() });
            return { status: "blocked" };
        }
        const projects = await this.dependencies.projectRepository.listProjects(input.userId);
        const project = projects.find((item) => item.id === target.workContextId && item.scopeId === target.scopeId);
        if (!project) {
            await this.dependencies.repository.blockWithoutAttempt({ target, code: "SCOPE_UNAVAILABLE", reason: "Project scope cannot be restored", now: this.dependencies.clock.now() });
            return { status: "blocked" };
        }
        const now = this.dependencies.clock.now();
        const context = await this.dependencies.projectRepository.loadProjectContext(input.userId, project, localDate(now, input.timeZone), input.timeZone, now);
        const step = context.taskSteps.find((item) => item.id === target.taskStepId);
        const task = context.tasks.find((item) => item.id === target.taskId);
        if (!step || !task || step.owner !== "ai" || step.skillKey !== target.skillKey) {
            await this.dependencies.repository.blockWithoutAttempt({ target, code: "INVALID_CONTEXT", reason: "TaskStep is outside the restored project context", now });
            return { status: "blocked" };
        }
        if (context.taskSteps.some((item) => item.taskId === step.taskId && item.position < step.position && !["completed", "skipped"].includes(item.status))) {
            throw new DomainError("CONFLICT", "TaskStep dependencies are unresolved");
        }
        const executionContext = createExecutionContext(context, target.taskStepId, input.revisionRequest);
        const contextHash = stableHash(executionContext);
        const executionKey = stableHash({ taskStepId: target.taskStepId, skillKey: documentDraftSkill.key, skillVersion: documentDraftSkill.version, contextHash });
        const successful = await this.dependencies.repository.findSuccessful(input.userId, executionKey);
        if (successful)
            return { status: "reused", ...successful };
        for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
            const started = await this.dependencies.repository.startAttempt({
                target, executionKey, contextHash, contextPayload: executionContext, sourceRefs: executionContext.sourceRefs,
                skillKey: documentDraftSkill.key, skillVersion: documentDraftSkill.version, maxAttempts: MAX_ATTEMPTS, now: this.dependencies.clock.now()
            });
            if (started.kind === "reused")
                return { status: "reused", agentRunId: started.agentRunId, artifactId: started.artifactId };
            if (started.kind === "busy")
                return { status: "busy" };
            if (started.kind === "exhausted")
                return { status: "blocked" };
            if (started.kind !== "started")
                return { status: "blocked" };
            const attempt = started;
            try {
                const skillInput = documentDraftSkill.inputSchema.parse({
                    ...executionContext, workflowRunId: attempt.workflowRunId, agentRunId: attempt.agentRunId, contextPackageId: attempt.contextPackageId
                });
                const output = documentDraftSkill.outputSchema.parse(await this.dependencies.executor.executeDocumentDraft(skillInput));
                const verificationErrors = documentDraftSkill.verify(skillInput, output);
                if (verificationErrors.length > 0)
                    throw new DomainError("PARSE_INVALID", "Document draft verification failed", { verificationErrors });
                const artifactId = await this.dependencies.repository.completeAttempt({
                    target, attempt, executionKey, result: output, sourceRefs: output.sourceRefs,
                    ...(input.revisionRequest ? { revisionOfArtifactId: input.revisionRequest.revisionOfArtifactId } : {}),
                    now: this.dependencies.clock.now()
                });
                return { status: "waiting_for_review", agentRunId: attempt.agentRunId, artifactId, attemptNumber: attempt.attemptNumber };
            }
            catch (error) {
                const retryable = !(error instanceof DomainError) || error.code === "PARSE_FAILED" || error.code === "PARSE_INVALID";
                const terminal = !retryable || attempt.attemptNumber >= MAX_ATTEMPTS;
                const code = error instanceof DomainError ? error.code : "EXECUTION_FAILED";
                const reason = error instanceof Error ? error.message : "Unknown AI execution failure";
                await this.dependencies.repository.failAttempt({ target, attempt, code, reason, terminal, now: this.dependencies.clock.now() });
                if (terminal)
                    return { status: "blocked" };
            }
        }
        return { status: "blocked" };
    }
}
//# sourceMappingURL=ai-task-execution-service.js.map