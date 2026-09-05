import { describe, expect, it } from "vitest";
import { derivePatternCandidates } from "./pattern-learning.js";
const item = (id, overrides = {}) => ({
    id,
    decisionType: "important_replan",
    situation: { impactReasons: ["deadline_risk_increased"] },
    userChoice: { action: "reject" },
    userReason: "오늘 마감 과제가 더 중요해서",
    observedOutcome: { completedTaskIds: [id], blockedTaskIds: [], varianceMinutes: -10 },
    observedAt: new Date(`2026-09-0${id}T12:00:00.000Z`),
    ...overrides
});
describe("deterministic Pattern Learning", () => {
    it("does not create a candidate from one or two LearningCases", () => {
        expect(derivePatternCandidates([item("1")])).toEqual([]);
        expect(derivePatternCandidates([item("1"), item("2")])).toEqual([]);
    });
    it("creates a candidate from three cases with matching situation, choice, and explicit reason", () => {
        const candidates = derivePatternCandidates([item("1"), item("2"), item("3")]);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
            decisionType: "important_replan",
            situationType: "deadline_risk_increased",
            choiceAction: "reject",
            consistencyKind: "reason",
            consistencyValue: "deadline_priority",
            confidence: 0.85
        });
        expect(candidates[0]?.evidence.map((evidence) => evidence.id)).toEqual(["1", "2", "3"]);
    });
    it("does not group three cases with different meanings", () => {
        const cases = [
            item("1"),
            item("2", { decisionType: "morning_override", situation: { reasons: ["important_task_removed"] }, userChoice: { action: "exclude_tasks" } }),
            item("3", { decisionType: "focus_task_switch", situation: {}, userChoice: { action: "switch_task" } })
        ];
        expect(derivePatternCandidates(cases)).toEqual([]);
    });
    it("uses consistent outcomes when no explicit reason category is available", () => {
        const cases = ["1", "2", "3"].map((id) => item(id, { userReason: null }));
        expect(derivePatternCandidates(cases)[0]).toMatchObject({
            consistencyKind: "outcome", consistencyValue: "task_completed"
        });
    });
    it("describes observed choices without personality or absolute claims", () => {
        const behavior = derivePatternCandidates([item("1"), item("2"), item("3")])[0].observedBehavior;
        expect(behavior).toContain("마감 위험");
        expect(behavior).toContain("선택이 반복됨");
        expect(behavior).not.toMatch(/항상|성향|게으/);
    });
});
//# sourceMappingURL=pattern-learning.test.js.map