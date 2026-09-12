import type { ParsedTaskDraft } from "./contracts.js";

export interface WorkContextCandidate {
  readonly id: string;
  readonly title: string;
  readonly kind: "project" | "course";
}

export interface ObjectiveCandidate {
  readonly id: string;
  readonly title: string;
  readonly workContextId: string | null;
}

export interface TaskContextResolution {
  readonly workContextId: string | null;
  readonly objectiveId: string | null;
  readonly ambiguous: boolean;
  readonly ambiguity: "work_context" | "objective" | "conflict" | null;
}

const normalize = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]+/gu, "");

const matchUnique = <T extends { readonly title: string }>(hint: string | undefined, values: readonly T[]): T | null | "ambiguous" => {
  if (!hint?.trim()) return null;
  const normalized = normalize(hint);
  const exact = values.filter((value) => normalize(value.title) === normalized);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return "ambiguous";
  const partial = values.filter((value) => {
    const title = normalize(value.title);
    return title.includes(normalized) || normalized.includes(title);
  });
  return partial.length === 1 ? partial[0]! : partial.length > 1 ? "ambiguous" : null;
};

export const resolveTaskContext = (
  draft: Pick<ParsedTaskDraft, "workContextHint" | "objectiveHint">,
  workContexts: readonly WorkContextCandidate[],
  objectives: readonly ObjectiveCandidate[]
): TaskContextResolution => {
  const workContext = matchUnique(draft.workContextHint, workContexts);
  if (workContext === "ambiguous") return { workContextId: null, objectiveId: null, ambiguous: true, ambiguity: "work_context" };

  const eligibleObjectives = workContext
    ? objectives.filter((objective) => objective.workContextId === null || objective.workContextId === workContext.id)
    : objectives;
  const objective = matchUnique(draft.objectiveHint, eligibleObjectives);
  if (objective === "ambiguous") return { workContextId: workContext?.id ?? null, objectiveId: null, ambiguous: true, ambiguity: "objective" };
  if (objective && workContext && objective.workContextId && objective.workContextId !== workContext.id) {
    return { workContextId: null, objectiveId: null, ambiguous: true, ambiguity: "conflict" };
  }
  return {
    workContextId: workContext?.id ?? objective?.workContextId ?? null,
    objectiveId: objective?.id ?? null,
    ambiguous: false,
    ambiguity: null
  };
};
