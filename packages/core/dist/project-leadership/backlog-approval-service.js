import { DomainError } from "@amber/shared";
import { backlogApprovalDecisionSchema } from "./backlog-approval.js";
import { projectProjectState, projectStateFingerprint } from "./project-state-projector.js";
const localDate = (value, timeZone) => {
    const fields = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const read = (type) => fields.find((field) => field.type === type)?.value ?? "";
    return `${read("year")}-${read("month")}-${read("day")}`;
};
const validateDecision = (approval, decision) => {
    if (!approval)
        throw new DomainError("INVALID_INPUT", "Backlog approval request not found");
    if (approval.proposalArtifactId !== decision.proposalArtifactId || approval.proposalHash !== decision.proposalHash) {
        throw new DomainError("CONFLICT", "Backlog proposal binding does not match the approval request");
    }
    const proposalKeys = new Set(approval.proposal.items.map((item) => item.key));
    const accepted = decision.acceptedItems.map((item) => item.proposalItemKey);
    const excluded = decision.excludedItems.map((item) => item.proposalItemKey);
    const selected = [...accepted, ...excluded];
    if (new Set(selected).size !== selected.length) {
        throw new DomainError("INVALID_INPUT", "A backlog proposal item cannot be accepted or excluded more than once");
    }
    if (selected.some((key) => !proposalKeys.has(key))) {
        throw new DomainError("INVALID_INPUT", "Backlog approval references an unknown proposal item");
    }
    if (selected.length !== proposalKeys.size) {
        throw new DomainError("INVALID_INPUT", "Every backlog proposal item must be accepted or excluded");
    }
};
export class BacklogApprovalService {
    dependencies;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async requestApproval(input) {
        return this.dependencies.repository.requestApproval({ ...input, now: this.dependencies.clock.now() });
    }
    async decide(input, timeZone) {
        const decision = backlogApprovalDecisionSchema.parse(input);
        const approval = await this.dependencies.repository.getApproval(decision.userId, decision.approvalRequestId);
        validateDecision(approval, decision);
        if (!approval)
            throw new DomainError("INVALID_INPUT", "Backlog approval request not found");
        if (approval.status === "approved") {
            return this.dependencies.repository.materialize({
                approval, decision, currentStateFingerprint: approval.sourceSnapshotFingerprint, now: this.dependencies.clock.now()
            });
        }
        if (approval.status !== "pending")
            throw new DomainError("CONFLICT", "Backlog approval request is not pending");
        const projects = await this.dependencies.projectRepository.listProjects(decision.userId);
        const project = projects.find((candidate) => candidate.id === approval.workContextId);
        if (!project)
            throw new DomainError("CONFLICT", "Project state is no longer available");
        const now = this.dependencies.clock.now();
        const context = await this.dependencies.projectRepository.loadProjectContext(decision.userId, project, localDate(now, timeZone), timeZone, now);
        const currentStateFingerprint = projectStateFingerprint(projectProjectState(context));
        if (currentStateFingerprint !== approval.sourceSnapshotFingerprint) {
            await this.dependencies.repository.expireStale(decision.userId, decision.approvalRequestId, now);
            throw new DomainError("CONFLICT", "Backlog proposal is stale and cannot be materialized");
        }
        return this.dependencies.repository.materialize({ approval, decision, currentStateFingerprint, now });
    }
}
//# sourceMappingURL=backlog-approval-service.js.map