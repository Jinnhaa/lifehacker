import { userIdSchema } from "@amber/shared";
import { z } from "zod";
import {
  documentDraftInputSchema,
  documentDraftResultSchema,
  type DocumentDraftInput,
  type DocumentDraftResult
} from "../agent-execution/ai-task-execution.js";
import {
  backlogRefinementResultSchema,
  gapAnalysisArtifactSchema,
  gapAnalysisResultSchema,
  projectStateSnapshotSchema,
  type BacklogRefinementInput,
  type BacklogRefinementResult,
  type GapAnalysisResult,
  type ProjectStateReviewInput
} from "./project-leadership.js";

export interface SkillDefinition<Input, Output> {
  readonly key: "project-state-review" | "backlog-refinement" | "document-draft";
  readonly version: "1";
  readonly inputSchema: z.ZodType<Input>;
  readonly outputSchema: z.ZodType<Output>;
  readonly allowedCapabilities: readonly string[];
  readonly completionCriteria: readonly string[];
  verify(input: Input, output: Output): readonly string[];
}

const projectStateReviewInputSchema: z.ZodType<ProjectStateReviewInput> = z.object({
  userId: userIdSchema, workflowRunId: z.string().min(1), snapshot: projectStateSnapshotSchema
});

const backlogRefinementInputSchema: z.ZodType<BacklogRefinementInput> = z.object({
  userId: userIdSchema, workflowRunId: z.string().min(1), snapshot: projectStateSnapshotSchema,
  gapAnalysis: gapAnalysisArtifactSchema, constraints: z.array(z.string())
});

export const projectStateReviewSkill: SkillDefinition<ProjectStateReviewInput, GapAnalysisResult> = {
  key: "project-state-review",
  version: "1",
  inputSchema: projectStateReviewInputSchema,
  outputSchema: gapAnalysisResultSchema,
  allowedCapabilities: ["project.read", "artifact.read", "decision.read", "event.read"],
  completionCriteria: ["모든 gap에 source evidence가 있다", "freshness와 unknown을 보존한다", "project scope 밖의 근거를 사용하지 않는다"],
  verify(input, output) {
    const allowed = new Set(input.snapshot.sourceRefs.map((item) => item.ref));
    return output.gaps.flatMap((gap) => gap.evidenceRefs
      .filter((reference) => !allowed.has(reference))
      .map((reference) => `gap ${gap.key} references evidence outside the project snapshot: ${reference}`));
  }
};

export const backlogRefinementSkill: SkillDefinition<BacklogRefinementInput, BacklogRefinementResult> = {
  key: "backlog-refinement",
  version: "1",
  inputSchema: backlogRefinementInputSchema,
  outputSchema: backlogRefinementResultSchema,
  allowedCapabilities: ["project.read", "artifact.read"],
  completionCriteria: ["모든 item이 Objective와 Gap을 참조한다", "owner와 acceptance criteria가 구조화되어 있다", "Task를 생성하지 않는다"],
  verify(input, output) {
    const gapKeys = new Set(input.gapAnalysis.gaps.map((gap) => gap.key));
    const objectiveIds = new Set(input.snapshot.objectives.map((objective) => objective.id));
    const evidence = new Set(input.snapshot.sourceRefs.map((item) => item.ref));
    for (const gap of input.gapAnalysis.gaps) evidence.add(`gap:${gap.key}`);
    return output.items.flatMap((item) => [
      ...(!gapKeys.has(item.sourceGapKey) ? [`backlog item ${item.key} references an unknown gap`] : []),
      ...(!objectiveIds.has(item.objectiveId) ? [`backlog item ${item.key} references an objective outside the project`] : []),
      ...item.evidenceRefs.filter((reference) => !evidence.has(reference))
        .map((reference) => `backlog item ${item.key} references unknown evidence: ${reference}`)
    ]);
  }
};

const criteria = (value: string | null): readonly string[] => value?.split("\n").map((item) => item.trim()).filter(Boolean) ?? [];

export const documentDraftSkill: SkillDefinition<DocumentDraftInput, DocumentDraftResult> = {
  key: "document-draft",
  version: "1",
  inputSchema: documentDraftInputSchema,
  outputSchema: documentDraftResultSchema,
  allowedCapabilities: ["project.read", "artifact.read", "decision.read"],
  completionCriteria: ["구조화된 초안이 비어 있지 않다", "TaskStep 완료 기준을 명시적으로 다룬다", "ContextPackage source만 인용한다"],
  verify(input, output) {
    const allowedSources = new Set(input.sourceRefs);
    const requiredCriteria = criteria(input.taskStep.completionCriteria ?? input.task.completionCriteria);
    return [
      ...requiredCriteria.filter((item) => !output.addressedCriteria.includes(item))
        .map((item) => `document draft does not address completion criterion: ${item}`),
      ...output.sourceRefs.filter((item) => !allowedSources.has(item))
        .map((item) => `document draft references source outside ContextPackage: ${item}`)
    ];
  }
};

export const projectLeadershipSkillRegistry = {
  [projectStateReviewSkill.key]: projectStateReviewSkill,
  [backlogRefinementSkill.key]: backlogRefinementSkill,
  [documentDraftSkill.key]: documentDraftSkill
} as const;
