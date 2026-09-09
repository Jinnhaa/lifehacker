import { createHash } from "node:crypto";
import { projectStateSnapshotSchema } from "./project-leadership.js";
const byId = (left, right) => left.id.localeCompare(right.id);
const iso = (value) => value?.toISOString() ?? null;
export const stableJson = (value) => {
    const normalize = (item) => {
        if (Array.isArray(item))
            return item.map(normalize);
        if (item && typeof item === "object") {
            return Object.fromEntries(Object.entries(item)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, normalize(child)]));
        }
        return item;
    };
    return JSON.stringify(normalize(value));
};
export const contentHash = (value) => createHash("sha256").update(stableJson(value)).digest("hex");
export const projectStateFingerprint = (snapshot) => contentHash({
    ...snapshot,
    generatedAt: undefined,
    sourceRefs: snapshot.sourceRefs.map((source) => ({
        ...source,
        observedAt: source.kind === "external_reference" ? source.observedAt : undefined
    }))
});
const externalFreshness = (reference) => {
    if (reference.syncStatus === "stale" || reference.syncStatus === "conflict")
        return "stale";
    if (reference.syncStatus !== "active" || reference.externalVersion === null)
        return "unknown";
    return "current";
};
export const projectProjectState = (context) => {
    const objectives = [...context.objectives].sort((left, right) => right.importance - left.importance
        || (left.targetDate ?? "9999-12-31").localeCompare(right.targetDate ?? "9999-12-31")
        || left.id.localeCompare(right.id));
    const generatedAt = context.observedAt.toISOString();
    const internalSource = (kind, id, hash = null) => ({
        ref: `${kind}:${id}`, kind, freshness: "current", observedAt: generatedAt, contentHash: hash
    });
    const sourceRefs = [
        internalSource("work_context", context.project.id),
        ...context.goals.map((item) => internalSource("goal", item.id)),
        ...objectives.map((item) => internalSource("objective", item.id)),
        ...context.tasks.map((item) => internalSource("task", item.id)),
        ...context.taskSteps.map((item) => internalSource("task_step", item.id)),
        ...context.artifacts.map((item) => internalSource("artifact", item.id, item.contentHash)),
        ...context.decisions.map((item) => internalSource("decision", item.id)),
        ...context.recentEvents.map((item) => internalSource("domain_event", item.id)),
        ...context.sourceReferences.map((item) => ({
            ref: `external_reference:${item.id}`,
            kind: "external_reference",
            freshness: externalFreshness(item),
            observedAt: item.lastSeenAt.toISOString(),
            contentHash: item.contentHash
        }))
    ].sort((left, right) => left.ref.localeCompare(right.ref));
    const unresolved = [
        ...(objectives.length === 0 ? ["active_objective_unknown"] : []),
        ...objectives.filter((item) => item.successCriteria === null).map((item) => `objective_success_criteria_unknown:${item.id}`),
        ...context.sourceReferences.filter((item) => externalFreshness(item) !== "current")
            .map((item) => `source_freshness_${externalFreshness(item)}:${item.id}`)
    ].sort();
    return projectStateSnapshotSchema.parse({
        schemaVersion: "1",
        workContextId: context.project.id,
        generatedAt,
        project: {
            id: context.project.id, title: context.project.title, description: context.project.description,
            status: context.project.status, startDate: context.project.startDate, endDate: context.project.endDate
        },
        primaryObjectiveId: objectives[0]?.id ?? null,
        objectives,
        goals: [...context.goals].sort(byId),
        tasks: [...context.tasks].sort(byId).map((task) => ({
            id: task.id, objectiveId: task.objectiveId, title: task.title, description: task.description,
            status: task.status, importance: task.importance, officialDeadline: iso(task.officialDeadline),
            internalDeadline: iso(task.internalDeadline), nextAction: task.nextAction, completionCriteria: task.completionCriteria,
            steps: context.taskSteps.filter((step) => step.taskId === task.id).sort((left, right) => left.position - right.position || byId(left, right))
                .map((step) => ({
                id: step.id, position: step.position, title: step.title, owner: step.owner,
                estimatedMinutes: step.estimatedMinutes, completionCriteria: step.completionCriteria, status: step.status
            }))
        })),
        artifacts: [...context.artifacts].sort(byId).map((artifact) => ({
            id: artifact.id, artifactType: artifact.artifactType, title: artifact.title, taskId: artifact.taskId,
            contentText: artifact.contentText, contentHash: artifact.contentHash, createdAt: artifact.createdAt.toISOString()
        })),
        decisions: [...context.decisions].sort(byId).map((decision) => ({
            ...decision, createdAt: decision.createdAt.toISOString(), resolvedAt: iso(decision.resolvedAt)
        })),
        recentEvents: [...context.recentEvents].sort(byId).map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
        sourceRefs,
        blockers: context.tasks.filter((task) => task.status === "BLOCKED").sort(byId).map((task) => ({ taskId: task.id, title: task.title })),
        unresolved
    });
};
//# sourceMappingURL=project-state-projector.js.map