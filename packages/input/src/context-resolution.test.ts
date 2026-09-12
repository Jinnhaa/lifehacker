import { describe, expect, it } from "vitest";
import { resolveTaskContext } from "./context-resolution.js";

describe("resolveTaskContext", () => {
  const contexts = [
    { id: "logfolio", title: "LogFolio", kind: "project" as const },
    { id: "database", title: "데이터베이스", kind: "course" as const }
  ];
  const objectives = [{ id: "apply", title: "지원서 제출", workContextId: "logfolio" }];

  it("resolves unique normalized context and objective hints", () => {
    expect(resolveTaskContext({ workContextHint: "log folio", objectiveHint: "지원서 제출" }, contexts, objectives))
      .toEqual({ workContextId: "logfolio", objectiveId: "apply", ambiguous: false, ambiguity: null });
  });

  it("allows no match without inventing a foreign key", () => {
    expect(resolveTaskContext({ workContextHint: "없는 프로젝트" }, contexts, objectives))
      .toEqual({ workContextId: null, objectiveId: null, ambiguous: false, ambiguity: null });
  });

  it("does not choose among ambiguous partial matches", () => {
    const values = [...contexts, { id: "logfolio-next", title: "LogFolio Next", kind: "project" as const }];
    expect(resolveTaskContext({ workContextHint: "LogFolio" }, values, objectives))
      .toEqual({ workContextId: "logfolio", objectiveId: null, ambiguous: false, ambiguity: null });
    expect(resolveTaskContext({ workContextHint: "Log" }, values, objectives)).toMatchObject({ workContextId: null, ambiguous: true });
  });
});
