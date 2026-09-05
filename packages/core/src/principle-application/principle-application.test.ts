import { describe, expect, it } from "vitest";
import { applyApprovedPrinciples, type ApprovedPlanningPrinciple, type PlanningPriorityCandidate } from "./principle-application.js";

const principle: ApprovedPlanningPrinciple = {
  id: "principle-1", statement: "마감이 가까운 일을 우선한다", origin: "pattern_observed",
  decisionType: "important_replan", situationType: "deadline_risk_increased", choiceAction: "approve",
  consistencyKind: "reason", consistencyValue: "deadline_priority",
  applicationPolicy: "deadline_over_routine"
};
const now = new Date("2026-09-04T00:00:00.000Z");
const task: PlanningPriorityCandidate = {
  type: "task", id: "task", title: "과제", rank: 3, importance: 3,
  deadline: new Date("2026-09-06T14:59:59.000Z")
};
const routine: PlanningPriorityCandidate = {
  type: "routine", id: "routine", title: "일본어", rank: 2, importance: 4, deadline: null
};

describe("approved Principle application", () => {
  it("uses a supported approved preference to break an ambiguous priority", () => {
    const result = applyApprovedPrinciples([task, routine], [principle], now, "Asia/Seoul");
    expect(result.candidates.map((item) => item.id)).toEqual(["task", "routine"]);
    expect(result.usedPrincipleIds).toEqual([principle.id]);
  });

  it("does not claim use when the current explicit selection removed the relevant task", () => {
    const result = applyApprovedPrinciples([routine], [principle], now, "Asia/Seoul");
    expect(result.candidates).toEqual([routine]);
    expect(result.usedPrincipleIds).toEqual([]);
  });

  it("does not execute an unstructured user-edited statement", () => {
    const result = applyApprovedPrinciples([task, routine], [{ ...principle, origin: "user_explicit" }], now, "Asia/Seoul");
    expect(result.candidates.map((item) => item.id)).toEqual(["routine", "task"]);
    expect(result.usedPrincipleIds).toEqual([]);
  });
});
