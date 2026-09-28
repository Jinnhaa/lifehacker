import { describe, expect, it } from "vitest";
import { outcomeJudgmentSchema } from "@amber/core";
import type { HomeTaskDetails } from "./home-chief-presentation";
import { mapHomeChief } from "./home-chief-presentation";
import { canonicalWorkTodayChoices, mapCanonicalWorkTodayQuests } from "./work-chief-presentation";
import type { WorkTaskItem } from "./work-types";

type Choice = ReturnType<typeof outcomeJudgmentSchema.parse>["todayPriority"][number];
const choice = (taskId: string, minutes = 30): Choice => ({
  taskId, outcome: `Outcome ${taskId}`, reasonCodes: ["IMPORTANT"], rationale: "Canonical evidence",
  evidenceRefs: [`task:${taskId}`], minutes
});
const judgment = (selected: Choice[], missionId: string | null = selected[0]?.taskId ?? null, notToday: Choice[] = []) => outcomeJudgmentSchema.parse({
  version: "chief-outcome-v1", todayPriority: selected, futureRelief: null, notToday, risks: [],
  currentMission: missionId ? { taskId: missionId, title: missionId, source: "chief_recommendation", reasonCodes: ["IMPORTANT"] } : null,
  selectedTaskIds: selected.map((item) => item.taskId),
  eligibleTaskIds: [...selected, ...notToday].map((item) => item.taskId),
  approvedPlan: null, capacityKnown: true
});
const task = (id: string): WorkTaskItem => ({
  id, title: `Task ${id}`, status: "PLANNED", plannedDate: "2026-09-26", plannedDateSource: "chief",
  officialDeadline: null, internalDeadline: null, internalDeadlineInput: "", officialDeadlineLabel: null,
  internalDeadlineLabel: null, estimatedMinutes: 30, workContextId: null, contextTitle: null, contextKind: null,
  goalId: null, goalTitle: null, goalLevel: null, priorityBand: "P3"
});
const homeTask = (id: string): HomeTaskDetails => ({
  id, title: `Task ${id}`, context: null, completionCriteria: null, scopeExclusions: null
});

describe("Work Today canonical Chief presentation", () => {
  it("uses canonical Chief #1 as Work Today Quest #1", () => {
    expect(mapCanonicalWorkTodayQuests(judgment([choice("first"), choice("second")]), [task("second"), task("first")])[0]?.id).toBe("first");
  });

  it("keeps Home Main Quest and Work Today #1 on the same stable identity", () => {
    const result = judgment([choice("first"), choice("main")], "main");
    const home = mapHomeChief(result, [homeTask("first"), homeTask("main")]);
    const work = mapCanonicalWorkTodayQuests(result, [task("first"), task("main")]);
    expect(work[0]?.id).toBe(home.currentAction?.taskId);
  });

  it("preserves canonical #2/#3 ordering regardless of Task metadata order", () => {
    const result = judgment([choice("one"), choice("two"), choice("three")]);
    expect(mapCanonicalWorkTodayQuests(result, [task("three"), task("one"), task("two")]).map((item) => item.id)).toEqual(["one", "two", "three"]);
  });

  it.each(["no_plan", "pending_approval", "approved"])("does not depend on %s Morning state", () => {
    expect(mapCanonicalWorkTodayQuests(judgment([choice("one")]), [task("one")]).map((item) => item.id)).toEqual(["one"]);
  });

  it("does not fill the ordered list from non-selected candidates", () => {
    const result = judgment([choice("one")], "one", [choice("inventory")]);
    expect(mapCanonicalWorkTodayQuests(result, [task("inventory"), task("one")]).map((item) => item.id)).toEqual(["one"]);
  });

  it("returns the safe empty state when Chief selects no actionable outcome", () => {
    expect(mapCanonicalWorkTodayQuests(judgment([], null), [task("inventory")])).toEqual([]);
  });

  it("does not mutate active Focus while projecting continuity", () => {
    const focus = { taskId: "active", status: "active" };
    const before = structuredClone(focus);
    expect(canonicalWorkTodayChoices(judgment([choice("active"), choice("next")], "active"))[0]?.taskId).toBe("active");
    expect(focus).toEqual(before);
  });

  it("can show stronger canonical priority without switching active Focus", () => {
    const focus = { taskId: "active", status: "active" };
    const before = structuredClone(focus);
    expect(mapCanonicalWorkTodayQuests(judgment([choice("hard"), choice("active")], "hard"), [task("active"), task("hard")])[0]?.id).toBe("hard");
    expect(focus).toEqual(before);
  });

  it("uses a deterministic projection without an API or LLM fallback", () => {
    expect(mapCanonicalWorkTodayQuests(judgment([choice("one")]), [task("one")])).toHaveLength(1);
  });
});
