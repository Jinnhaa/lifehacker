import { DomainError } from "@amber/shared";
import { backlogProposalArtifactSchema, gapAnalysisArtifactSchema } from "./project-leadership.js";
import { projectProjectState } from "./project-state-projector.js";
import { backlogRefinementSkill, projectStateReviewSkill } from "./skill-registry.js";
const localDate = (value, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const field = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${field("year")}-${field("month")}-${field("day")}`;
};
const assertVerified = (skill, issues) => {
    if (issues.length > 0)
        throw new DomainError("PARSE_INVALID", `${skill} output failed verification`, { issues });
};
export class ProjectLeadershipService {
    dependencies;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async run(request) {
        const projects = await this.dependencies.projectRepository.listProjects(request.userId);
        const project = projects.find((item) => item.id === request.workContextId);
        if (!project)
            throw new DomainError("INVALID_INPUT", "Project WorkContext not found");
        if (!project.scopeId)
            throw new DomainError("INVALID_INPUT", "Project WorkContext has no scope");
        const observedAt = this.dependencies.clock.now();
        const context = await this.dependencies.projectRepository.loadProjectContext(request.userId, project, localDate(observedAt, request.timeZone), request.timeZone, observedAt);
        if (context.userId !== request.userId || context.project.id !== request.workContextId) {
            throw new DomainError("CROSS_USER_ACCESS", "Project context does not match the requested scope");
        }
        const projected = projectProjectState(context);
        let workflow = await this.dependencies.workflowRepository.getOrCreateWorkflow({
            userId: request.userId,
            workContextId: project.id,
            scopeId: project.scopeId,
            idempotencyKey: request.idempotencyKey,
            contextPayload: projected,
            sourceRefs: projected.sourceRefs.map((item) => item.ref),
            ...(request.correlationId ? { correlationId: request.correlationId } : {}),
            ...(request.causationId ? { causationId: request.causationId } : {}),
            now: observedAt
        });
        if (workflow.status === "completed")
            return this.completedResult(workflow);
        if (!workflow.snapshot) {
            workflow = await this.dependencies.workflowRepository.saveSnapshot(request.userId, workflow, projected, this.dependencies.clock.now());
        }
        const snapshot = workflow.snapshot;
        if (!workflow.gapAnalysis) {
            const input = projectStateReviewSkill.inputSchema.parse({
                userId: request.userId, workflowRunId: workflow.id, snapshot: snapshot.content
            });
            const output = projectStateReviewSkill.outputSchema.parse(await this.dependencies.analysisProvider.reviewProjectState(input));
            assertVerified(projectStateReviewSkill.key, projectStateReviewSkill.verify(input, output));
            const generatedAt = this.dependencies.clock.now();
            const gapAnalysis = gapAnalysisArtifactSchema.parse({
                schemaVersion: "1",
                workContextId: project.id,
                objectiveId: snapshot.content.primaryObjectiveId,
                sourceSnapshotArtifactId: snapshot.id,
                sourceRefs: [...new Set(output.gaps.flatMap((gap) => gap.evidenceRefs))].sort(),
                generatedAt: generatedAt.toISOString(),
                ...output
            });
            workflow = await this.dependencies.workflowRepository.saveGapAnalysis(request.userId, workflow, gapAnalysis, generatedAt);
        }
        const gapAnalysis = workflow.gapAnalysis;
        if (!workflow.backlogProposal) {
            const input = backlogRefinementSkill.inputSchema.parse({
                userId: request.userId,
                workflowRunId: workflow.id,
                snapshot: snapshot.content,
                gapAnalysis: gapAnalysis.content,
                constraints: request.constraints ?? []
            });
            const output = backlogRefinementSkill.outputSchema.parse(await this.dependencies.analysisProvider.refineBacklog(input));
            assertVerified(backlogRefinementSkill.key, backlogRefinementSkill.verify(input, output));
            const generatedAt = this.dependencies.clock.now();
            const proposal = backlogProposalArtifactSchema.parse({
                schemaVersion: "1",
                workContextId: project.id,
                objectiveId: snapshot.content.primaryObjectiveId,
                sourceSnapshotArtifactId: snapshot.id,
                sourceGapAnalysisArtifactId: gapAnalysis.id,
                sourceRefs: [...new Set(output.items.flatMap((item) => item.evidenceRefs))].sort(),
                generatedAt: generatedAt.toISOString(),
                ...output
            });
            workflow = await this.dependencies.workflowRepository.saveBacklogProposal(request.userId, workflow, proposal, generatedAt);
        }
        return this.completedResult(workflow);
    }
    completedResult(workflow) {
        if (!workflow.snapshot || !workflow.gapAnalysis || !workflow.backlogProposal) {
            throw new DomainError("CONFLICT", "Completed project leadership workflow has an incomplete checkpoint");
        }
        return {
            workflowRunId: workflow.id,
            snapshot: workflow.snapshot,
            gapAnalysis: workflow.gapAnalysis,
            backlogProposal: workflow.backlogProposal
        };
    }
}
//# sourceMappingURL=project-leadership-service.js.map