import { describe, expect, it } from "vitest";
import { outcomeJudgmentSchema, judgeOutcomes, projectFutureCapacity } from "@amber/core";
import type { Task } from "@amber/core";
import { canStartHomeQuest, homeChiefReason, homeFocusMatchesRecommendation, mapHomeChief, type HomeTaskDetails } from "./home-chief-presentation";
import type { HomeViewModel } from "./home-types";

type Choice = NonNullable<HomeViewModel["outcomePriority"]>["judgment"]["todayPriority"][number];
const choice = (taskId:string, reasonCodes:Choice["reasonCodes"]=["IMPORTANT"], overrides:Partial<Choice>={}) => ({taskId,outcome:taskId,reasonCodes,rationale:"Core evidence",evidenceRefs:[`task:${taskId}`],minutes:30,...overrides});
const result = (today=[choice("main")],notToday:Choice[]=[],mainId:string|null=today[0]?.taskId ?? null) => outcomeJudgmentSchema.parse({
  version:"chief-outcome-v1",todayPriority:today,futureRelief:null,notToday,risks:[],currentMission:mainId ? {taskId:mainId,title:mainId,source:"chief_recommendation",reasonCodes:today.find(item=>item.taskId===mainId)?.reasonCodes ?? ["IMPORTANT"]} : null,
  selectedTaskIds:today.map(item=>item.taskId),eligibleTaskIds:[...today,...notToday].filter(item=>!item.reasonCodes.includes("BLOCKED")&&!item.reasonCodes.includes("UNKNOWN_EFFORT")).map(item=>item.taskId),approvedPlan:null,capacityKnown:true
});
const details=(id:string,extra:Partial<HomeTaskDetails>={}):HomeTaskDetails=>({id,title:`Title ${id}`,context:"Course",completionCriteria:null,scopeExclusions:null,...extra});
const execution = (currentAction:HomeViewModel["currentAction"],focus:HomeViewModel["focus"]=null) => ({configured:true,currentAction,focus});
const activeFocus:NonNullable<HomeViewModel["focus"]>={step:"active",taskId:"main",occurrenceId:null,category:null,startedAt:"2026-09-26T00:00:00Z",durationMinutes:45,stepTitle:null,title:"Current Focus"};

describe("Home canonical Chief presentation",()=>{
  it("uses the canonical current mission rather than the first candidate",()=>{
    const model=mapHomeChief(result([choice("first"),choice("main")],[],"main"),[details("main"),details("first")]);
    expect(model.currentAction).toMatchObject({taskId:"main",title:"Title main",context:"Course"});
  });
  it.each(["no_plan","pending_approval","approved"] as const)("allows Main Quest execution with %s plan status",planStatus=>{
    const model=mapHomeChief(result(),[details("main")]);
    expect(canStartHomeQuest({...execution(model.currentAction),planState:{status:planStatus}} as Parameters<typeof canStartHomeQuest>[0])).toBe(true);
  });
  it("maps hard deadline reason",()=>{expect(homeChiefReason(["DUE_TODAY","REQUIRED_COMMITMENT"])).toContain("오늘 공식 마감");});
  it("maps Future Capacity deficit",()=>{expect(homeChiefReason(["FUTURE_CAPACITY_DEFICIT"])).toBe("나중에 할 시간이 부족해요");});
  it("maps Weekly Focus",()=>{expect(homeChiefReason(["WEEKLY_FOCUS"])).toBe("이번 주 Focus");});
  it("preserves supplied completion criteria",()=>{
    expect(mapHomeChief(result(),[details("main",{completionCriteria:"Submit the agreed interface"})]).currentAction?.completionCriteria).toBe("Submit the agreed interface");
  });
  it("preserves supplied scope exclusions",()=>{
    expect(mapHomeChief(result(),[details("main",{scopeExclusions:"No visual polish"})]).currentAction?.scopeExclusions).toBe("No visual polish");
  });
  it("does not fabricate a missing completion boundary",()=>{
    const model=mapHomeChief(result(),[details("main")]);
    expect(model.currentAction?.completionCriteria).toBeNull();expect(model.currentAction?.scopeExclusions).toBeNull();
  });
  it("does not reassure safe deferral with unknown capacity even if a stale positive number exists",()=>{
    const model=mapHomeChief(result([choice("main")],[choice("other",["FUTURE_CAPACITY_UNKNOWN"],{capacityWindowSlackMinutes:60})]),[details("main"),details("other")]);
    expect(model.reassurance[0]).toMatchObject({status:"uncertain"});expect(model.reassurance[0]!.explanation).toContain("미정");
  });
  it("does not reassure safe deferral with unknown effort",()=>{
    const model=mapHomeChief(result([choice("main")],[choice("unknown",["UNKNOWN_EFFORT"],{capacityWindowSlackMinutes:60})]),[details("main")]);
    expect(model.reassurance[0]!.status).toBe("uncertain");
  });
  it("uses canonical positive slack as bounded reassurance",()=>{
    const model=mapHomeChief(result([choice("main")],[choice("other",["IMPORTANT"],{capacityWindowSlackMinutes:60})]),[details("main")]);
    expect(model.reassurance[0]).toMatchObject({status:"safe",explanation:"확인된 마감 window에 60분 여유가 있어요"});
  });
  it("shows negative slack as constrained and never safe",()=>{
    expect(mapHomeChief(result([choice("main")],[choice("other",["IMPORTANT"],{capacityWindowSlackMinutes:-60})]),[details("main")]).reassurance[0]!.status).toBe("constrained");
  });
  it("never reranks the canonical candidate order by Task metadata",()=>{
    const model=mapHomeChief(result([choice("main"),choice("z"),choice("a")]),[details("a"),details("z"),details("main")]);
    expect(model.nextQuests.map(item=>item.taskId)).toEqual(["z","a"]);
  });
  it("preserves active Focus continuity when Chief keeps it",()=>{
    const judgment=result();judgment.currentMission!.source="focus_session";
    const action=mapHomeChief(judgment,[details("main")]).currentAction;
    expect(homeFocusMatchesRecommendation(execution(action,activeFocus))).toBe(true);
    expect(canStartHomeQuest(execution(action,activeFocus))).toBe(false);
  });
  it("displays a stronger recommendation without ending or switching the active Focus",()=>{
    const before=structuredClone(activeFocus);
    const action=mapHomeChief(result([choice("hard",["DUE_TODAY"])],[],"hard"),[details("hard")]).currentAction;
    expect(action?.taskId).toBe("hard");expect(homeFocusMatchesRecommendation(execution(action,activeFocus))).toBe(false);
    expect(canStartHomeQuest(execution(action,activeFocus))).toBe(false);expect(activeFocus).toEqual(before);
  });
  it("keeps an empty state when Core has no current executable outcome",()=>{
    const model=mapHomeChief(result([],[],null),[]);expect(model.currentAction).toBeNull();expect(model.nextQuests).toEqual([]);
    expect(canStartHomeQuest(execution(model.currentAction))).toBe(false);
  });
  it("retains at most two Next Quests and excludes blocked/unknown-effort candidates",()=>{
    const model=mapHomeChief(result([choice("main")],[choice("blocked",["BLOCKED"]),choice("unknown",["UNKNOWN_EFFORT"]),choice("one"),choice("two"),choice("three")]),[details("main")]);
    expect(model.nextQuests.map(item=>item.taskId)).toEqual(["one","two"]);
  });
  it("compresses reassurance to three meaningful items",()=>{
    expect(mapHomeChief(result([choice("main")],Array.from({length:5},(_,i)=>choice(`other-${i}`))),[details("main")]).reassurance).toHaveLength(3);
  });
  it("does not invent a safe conclusion from no deadline-window evidence",()=>{
    expect(mapHomeChief(result([choice("main")],[choice("other")]),[details("main")]).reassurance[0]!.status).toBe("uncertain");
  });
  it("supports deterministic Core-to-Home projection without API/LLM fallback",()=>{
    const now=new Date("2026-09-26T00:00:00Z");
    const task:Task={id:"task" as Task["id"],userId:"owner" as Task["userId"],workContextId:null,objectiveId:null,title:"Actual Task",description:null,executionMode:"standard",officialDeadline:new Date("2026-09-28T00:00:00Z"),internalDeadline:null,estimatedMinutes:30,estimatedUserMinutes:null,actualMinutes:0,importance:3,status:"PLANNED",nextAction:null,completionCriteria:null,completionSource:null,createdAt:now,completedAt:null,updatedAt:now};
    const future=projectFutureCapacity({startDate:"2026-09-26",endDate:"2026-09-28",timeZone:"Asia/Seoul",now,dailyAvailability:{"2026-09-26":[],"2026-09-27":[{start:now,end:new Date("2026-09-28T00:00:00Z")}],"2026-09-28":[]},constraints:[],planningBufferMinutes:0,tasks:[task]});
    const judgment=judgeOutcomes({observation:{timeZone:"Asia/Seoul",planningBufferMinutes:0,planningPolicy:{},constraints:[],tasks:[task],recurringActivities:[],strategicDirectives:[]},now,workUntil:null,privateIntervals:[],localWeekday:6,futureCapacity:future});
    expect(judgment.todayPriority[0]!.capacityWindowSlackMinutes).toBeGreaterThan(0);
    expect(mapHomeChief(judgment,[details("task",{title:task.title})]).currentAction?.title).toBe("Actual Task");
  });
});
