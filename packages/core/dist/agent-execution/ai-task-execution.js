import { userIdSchema } from "@amber/shared";
import { z } from "zod";
export const documentDraftResultSchema = z.object({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    body: z.string().trim().min(1),
    addressedCriteria: z.array(z.string().trim().min(1)).min(1),
    sourceRefs: z.array(z.string().trim().min(1)).min(1),
    uncertainties: z.array(z.string().trim().min(1))
}).strict();
export const documentDraftInputSchema = z.object({
    userId: userIdSchema, workflowRunId: z.string().uuid(), agentRunId: z.string().uuid(), contextPackageId: z.string().uuid(),
    workContext: z.object({ id: z.string().uuid(), title: z.string().min(1), description: z.string().nullable() }),
    objective: z.object({ id: z.string().uuid(), title: z.string().min(1), successCriteria: z.string().nullable() }).nullable(),
    task: z.object({ id: z.string().uuid(), title: z.string().min(1), description: z.string().nullable(), completionCriteria: z.string().nullable() }),
    taskStep: z.object({ id: z.string().uuid(), title: z.string().min(1), completionCriteria: z.string().nullable() }),
    acceptedArtifacts: z.array(z.object({ id: z.string().uuid(), artifactType: z.string().min(1), title: z.string().nullable(), contentText: z.string().nullable(), contentHash: z.string().nullable() })),
    decisions: z.array(z.object({ id: z.string().uuid(), question: z.string().min(1), whyNow: z.string().min(1), status: z.string().min(1) })),
    sourceRefs: z.array(z.string().min(1)).min(1), executionConstraints: z.array(z.string().min(1)).min(1)
});
export const createExecutionContext = (context, taskStepId) => {
    const step = context.taskSteps.find((item) => item.id === taskStepId);
    const task = context.tasks.find((item) => item.id === step.taskId);
    const objective = context.objectives.find((item) => item.id === task.objectiveId) ?? null;
    const sourceRefs = [
        `work_context:${context.project.id}`, `task:${task.id}`, `task_step:${step.id}`,
        ...(objective ? [`objective:${objective.id}`] : []),
        ...context.artifacts.map((item) => `artifact:${item.id}`), ...context.decisions.map((item) => `decision:${item.id}`),
        ...context.sourceReferences.map((item) => `external_reference:${item.id}:${item.externalVersion ?? item.contentHash ?? "unknown"}`)
    ];
    return {
        userId: context.userId,
        workContext: { id: context.project.id, title: context.project.title, description: context.project.description },
        objective: objective ? { id: objective.id, title: objective.title, successCriteria: objective.successCriteria } : null,
        task: { id: task.id, title: task.title, description: task.description, completionCriteria: task.completionCriteria },
        taskStep: { id: step.id, title: step.title, completionCriteria: step.completionCriteria },
        acceptedArtifacts: context.artifacts.map((item) => ({ id: item.id, artifactType: item.artifactType, title: item.title, contentText: item.contentText, contentHash: item.contentHash })),
        decisions: context.decisions.map((item) => ({ id: item.id, question: item.question, whyNow: item.whyNow, status: item.status })),
        sourceRefs,
        executionConstraints: ["read-only project scope", "no external writes", "do not invent facts outside sourceRefs"]
    };
};
//# sourceMappingURL=ai-task-execution.js.map