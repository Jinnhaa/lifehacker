import type { TaskId, UserId } from "@amber/shared";
import { describe, expect, it } from "vitest";
import type { Task } from "../task/task.js";
import type { MorningObservation } from "../morning/morning.js";
import { projectFutureCapacity } from "../future-capacity/future-capacity.js";
import { deriveCurrentStatus } from "./current-status.js";
import { judgeOutcomes, type OutcomeEvidence } from "./outcome-priority.js";

const now = new Date("2026-09-26T09:00:00+09:00");
const deadline = new Date("2026-09-28T23:59:00+09:00");
const task = (id: string, overrides: Partial<Task> = {}): Task => ({ id:id as TaskId,userId:"owner" as UserId,workContextId:id,objectiveId:null,title:id,description:null,
  executionMode:"standard",officialDeadline:null,internalDeadline:null,plannedDate:null,estimatedMinutes:30,estimatedUserMinutes:null,actualMinutes:0,importance:3,status:"INBOX",
  nextAction:null,completionCriteria:null,completionSource:null,createdAt:now,completedAt:null,updatedAt:now,...overrides });
const context = (id: string, commitmentLevel: "REQUIRED"|"IMPORTANT"|"OPTIONAL"|null = null, strategicImportance: number|null = null, studyMode: "CUMULATIVE"|"MIXED"|"CRAMMABLE"|null = null) => ({ id,commitmentLevel,strategicImportance,studyMode,examDate:null });
const observation = (tasks: readonly Task[], evidence: Partial<OutcomeEvidence> = {}): MorningObservation => ({ timeZone:"Asia/Seoul",planningBufferMinutes:0,planningPolicy:{},constraints:[],tasks,recurringActivities:[],strategicDirectives:[],
  outcomeEvidence:{dependencies:[],steps:[],objectives:[],goals:[],artifacts:[],approvedPlan:null,activeFocusTaskId:null,approvedAction:null,...evidence} });
const projection = (tasks: readonly Task[], futureMinutes: number|null) => projectFutureCapacity({startDate:"2026-09-26",endDate:"2026-09-28",timeZone:"Asia/Seoul",now,
  dailyAvailability:{"2026-09-26":[],"2026-09-27":futureMinutes===null ? null : [{start:new Date("2026-09-27T09:00:00+09:00"),end:new Date(new Date("2026-09-27T09:00:00+09:00").getTime()+futureMinutes*60_000)}],"2026-09-28":[]},constraints:[],planningBufferMinutes:0,tasks });
const judge = (tasks: readonly Task[], evidence: Partial<OutcomeEvidence> = {}, futureMinutes?: number|null) => judgeOutcomes({ observation:observation(tasks,evidence),now,workUntil:new Date("2026-09-26T12:00:00+09:00"),privateIntervals:[],localWeekday:6,
  ...(futureMinutes===undefined ? {} : {futureCapacity:projection(tasks,futureMinutes)}) });
const all = (result: ReturnType<typeof judge>) => [...result.todayPriority,...result.notToday];
const focus = (level: "WEEKLY"|"MONTHLY", id: string) => ({id,title:id,status:"active",importance:3,level,periodStart:"2026-09-21",periodEnd:"2026-09-30"});

describe("Chief Priority v2 acceptance evidence", () => {
  it("hard deadline beats optional hobby work and high strategic importance", () => {
    const result=judge([task("required",{officialDeadline:now}),task("hobby")],{contexts:[context("required","REQUIRED",1),context("hobby","OPTIONAL",5)]});
    expect(result.todayPriority[0]!.taskId).toBe("required");
    expect(result.todayPriority[0]!.reasonCodes).toContain("DUE_TODAY");
  });
  it("required external dependency beats lower-impact optional work and preserves handoff boundary", () => {
    const result=judge([task("handoff",{completionCriteria:"Provide agreed interface"}),task("dependent"),task("hobby")],{contexts:[context("dependent","REQUIRED"),context("hobby","OPTIONAL")],dependencies:[{taskId:"dependent",prerequisiteTaskId:"handoff",completed:false}]});
    expect(result.todayPriority[0]).toMatchObject({taskId:"handoff",completionCriteria:"Provide agreed interface"});
    expect(result.todayPriority[0]!.reasonCodes).toContain("UNBLOCKS");
    expect(result.todayPriority[0]!.evidenceRefs).toContain("dependency:dependent:handoff");
    expect(result.eligibleTaskIds).not.toContain("dependent");
  });
  it("future capacity deficit pulls future required work earlier", () => {
    const tasks=[task("future",{estimatedMinutes:180,officialDeadline:deadline}),task("ordinary")];
    const result=judge(tasks,{contexts:[context("future","REQUIRED")]},60);
    expect(result.todayPriority[0]!.taskId).toBe("future");
    expect(result.todayPriority[0]!.reasonCodes).toContain("FUTURE_CAPACITY_DEFICIT");
  });
  it("positive future slack does not invent urgency", () => {
    const result=judge([task("future",{officialDeadline:deadline})],{},180);
    expect(all(result)[0]!.reasonCodes).not.toContain("FUTURE_CAPACITY_DEFICIT");
    expect(result.capacityConflicts).toEqual([]);
  });
  it("unknown future availability exposes uncertainty without escalating to hard loss", () => {
    const result=judge([task("future",{officialDeadline:deadline}),task("hard",{officialDeadline:now})],{},null);
    expect(result.todayPriority[0]!.taskId).toBe("hard");
    expect(all(result).find(c=>c.taskId==="future")!.reasonCodes).toContain("FUTURE_CAPACITY_UNKNOWN");
    expect(all(result).find(c=>c.taskId==="future")!.rationale).toContain("안전한 유예를 보장할 수 없습니다");
  });
  it("unknown deadline effort does not become safe to defer", () => {
    const result=judge([task("unknown",{estimatedMinutes:null,officialDeadline:deadline})],{},180);
    expect(result.notToday[0]!.reasonCodes).toEqual(expect.arrayContaining(["UNKNOWN_EFFORT","FUTURE_CAPACITY_UNKNOWN"]));
  });
  it("Weekly Focus breaks a reasonable tie and outranks Monthly Focus", () => {
    const result=judge([task("monthly",{objectiveId:"om"}),task("weekly",{objectiveId:"ow"})],{objectives:[{id:"om",title:"m",goalId:"m",importance:3,status:"active"},{id:"ow",title:"w",goalId:"w",importance:3,status:"active"}],goals:[focus("MONTHLY","m"),focus("WEEKLY","w")]});
    expect(result.todayPriority.map(c=>c.taskId)).toEqual(["weekly","monthly"]);
    expect(result.todayPriority[0]!.reasonCodes).toContain("WEEKLY_FOCUS");
    expect(result.todayPriority[1]!.reasonCodes).toContain("MONTHLY_FOCUS");
  });
  it("expired Weekly Focus is not active evidence", () => {
    const result=judge([task("expired",{objectiveId:"o"})],{objectives:[{id:"o",title:"o",goalId:"w",importance:3,status:"active"}],goals:[{...focus("WEEKLY","w"),periodEnd:"2026-09-25"}]});
    expect(result.todayPriority[0]!.reasonCodes).not.toContain("WEEKLY_FOCUS");
  });
  it("REQUIRED commitment beats comparable OPTIONAL work", () => {
    const result=judge([task("a-optional"),task("z-required")],{contexts:[context("a-optional","OPTIONAL"),context("z-required","REQUIRED")]});
    expect(result.todayPriority[0]!.taskId).toBe("z-required");
    expect(result.todayPriority[0]!.reasonCodes).toContain("REQUIRED_COMMITMENT");
  });
  it("strategic importance breaks a comparable tie without a default for null", () => {
    const result=judge([task("unset"),task("strategic")],{contexts:[context("unset",null,null),context("strategic",null,5)]});
    expect(result.todayPriority[0]!.taskId).toBe("strategic");
    expect(all(result).find(c=>c.taskId==="unset")!.reasonCodes).not.toContain("STRATEGIC_IMPORTANCE");
  });
  it("protects cumulative certification only with concrete capacity deficit", () => {
    const tasks=[task("cert",{officialDeadline:deadline,estimatedMinutes:180})];
    expect(judge(tasks,{contexts:[context("cert","IMPORTANT",4,"CUMULATIVE")]},60).todayPriority[0]!.reasonCodes).toContain("CUMULATIVE_PROTECTION");
    expect(judge(tasks,{contexts:[context("cert","IMPORTANT",4,"CUMULATIVE")]},300).todayPriority[0]!.reasonCodes).not.toContain("CUMULATIVE_PROTECTION");
  });
  it("does not pull CRAMMABLE certification forward solely from its type", () => {
    expect(judge([task("cert",{officialDeadline:deadline})],{contexts:[context("cert","IMPORTANT",null,"CRAMMABLE")]},180).todayPriority[0]!.reasonCodes).not.toContain("CUMULATIVE_PROTECTION");
  });
  it("active continuity wins a tie but yields to stronger hard evidence", () => {
    expect(judge([task("a-other"),task("z-active")],{activeFocusTaskId:"z-active"}).currentMission).toMatchObject({taskId:"z-active",source:"focus_session"});
    expect(judge([task("hard",{officialDeadline:now}),task("active")],{activeFocusTaskId:"active"}).currentMission).toMatchObject({taskId:"hard",source:"chief_recommendation"});
  });
  it("optional work yields when required deficit cannot fit now", () => {
    const tasks=[task("required",{estimatedMinutes:1200,officialDeadline:deadline}),task("optional")];
    const result=judge(tasks,{contexts:[context("required","REQUIRED"),context("optional","OPTIONAL")]},60);
    expect(result.selectedTaskIds).not.toContain("optional");
    expect(result.notToday.find(c=>c.taskId==="optional")!.reasonCodes).toContain("OPTIONAL_YIELDS");
  });
  it("allows optional work when known free capacity genuinely remains", () => {
    const result=judge([task("required",{officialDeadline:now}),task("optional")],{contexts:[context("required","REQUIRED"),context("optional","OPTIONAL")]});
    expect(result.selectedTaskIds).toContain("optional");
  });
  it("time spent and exposure do not turn weak/unvalidated learning into readiness", () => {
    const unit={id:"unit",userId:"owner" as UserId,workContextId:"cert",title:"unit",position:1,exposureState:"COMPLETE" as const,understandingState:"WEAK" as const,validationState:"NOT_TESTED" as const};
    const obs=observation([task("cert",{actualMinutes:15})],{learningUnits:[unit],focusEvidence:[{workContextId:"cert",completedSessions:20,actualMinutes:900}]});
    const result=judgeOutcomes({observation:obs,now,workUntil:null,privateIntervals:[],localWeekday:6});
    expect(result.todayPriority[0]!.evidenceRefs).toContain("learning-unit:unit:COMPLETE:WEAK:NOT_TESTED");
    expect(unit.validationState).toBe("NOT_TESTED");
    expect(JSON.stringify(result)).not.toContain("readiness");
  });
  it("does not require approved Morning Plan or configured work-until to recommend", () => {
    const result=judgeOutcomes({observation:observation([task("action")]),now,workUntil:null,privateIntervals:[],localWeekday:6});
    expect(result.currentMission!.taskId).toBe("action");
    expect(result.todayPriority[0]!.reasonCodes).toContain("CAPACITY_UNKNOWN");
    expect(result.todayPriority[0]!.reasonCodes).not.toContain("SCHEDULE_FIT");
    expect(result.approvedPlan).toBeNull();
  });
  it("keeps explainable reasons and no global weighted score", () => {
    const result=judge([task("hard",{officialDeadline:now})]);
    expect(result.todayPriority[0]!.reasonCodes).toEqual(expect.arrayContaining(["DUE_TODAY","SCHEDULE_FIT"]));
    expect(result.todayPriority[0]!.rationale).not.toBe("");
    expect(result.todayPriority[0]).not.toHaveProperty("score");
  });
  it("two important infeasible goals expose a conflict without fake progress", () => {
    const tasks=[task("first",{officialDeadline:deadline,estimatedMinutes:180}),task("second",{officialDeadline:deadline,estimatedMinutes:180})];
    const result=judge(tasks,{contexts:[context("first","IMPORTANT"),context("second","IMPORTANT")]},60);
    expect(result.capacityConflicts[0]).toMatchObject({knownRequiredWorkMinutes:360,availableMinutes:60,taskIds:["first","second"]});
    expect(JSON.stringify(result)).not.toMatch(/progress|percentage/);
  });
  it("CurrentStatus task order is a view of the canonical decision", () => {
    const obs=observation([task("optional"),task("hard",{officialDeadline:now})],{contexts:[context("optional","OPTIONAL")]});
    const result=judgeOutcomes({observation:obs,now,workUntil:null,privateIntervals:[],localWeekday:6});
    const status=deriveCurrentStatus({observation:obs,now,planDate:"2026-09-26",remainingCapacityMinutes:null,priorityJudgment:result});
    expect(status.priorities[0]!.taskId).toBe(result.todayPriority[0]!.taskId);
  });
});
