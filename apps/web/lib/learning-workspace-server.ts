import "server-only";

import {
  deriveMaterialProgress,
  deriveLearningRecovery,
  projectMaterialCompletion,
  proposeLearningTasks,
  resolveLearningAllocation
} from "@amber/core";
import type {
  LearningAllocationItem,
  LearningAllocationPolicy,
  LearningMaterial,
  LearningStage,
  LearningTaskProposal
} from "@amber/core";
import type { JSONValue } from "postgres";
import { loadLearningContexts } from "./context-management-server";
import type {
  LearningWorkspaceAction,
  LearningWorkspaceContext,
  LearningWorkspaceMaterial,
  LearningWorkspaceModel,
  LearningWorkspacePolicy,
  LearningWorkspaceStage
} from "./learning-workspace-types";
import { getWebSql, getWebUserId } from "./web-runtime";

type UnitRow = {
  id: string; workContextId: string; materialId: string | null; sequenceNo: number | null;
  exposureState: "NOT_STARTED" | "PARTIAL" | "COMPLETE";
  understandingState: "UNKNOWN" | "WEAK" | "OK" | "STRONG";
  validationState: "NOT_TESTED" | "FAILED" | "PASSED";
};
type AssessmentRow = { id: string; workContextId: string; title: string; dueDate: string | Date | null; dueAt: string | Date | null };
type ActiveTaskRow = { taskId: string; targetId: string; workContextId: string; materialId: string; title: string;
  assignedUnits: number; startSequence: number | null; endSequence: number | null; allocationPolicyId: string | null; policyName: string | null;
  estimatedMinutes: number | null };
type ActivityRow = { id: string; workContextId: string; kind: "focus" | "task" | "event"; title: string; minutes: number | null; occurredAt: string | Date };
type ResolvedTargetRow = { materialId: string; materializationKey: string | null; executionStatus: "COMPLETED" | "PARTIAL" | "SKIPPED" | "CANCELLED";
  recoveryMode: "REDISTRIBUTE" | "RESET" | "CARRY_FORWARD" | "MANUAL" | null; assignedUnits: number; resolvedAt: string | Date; planDate: string };

const seoulDate = (): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const isoDate = (value: string | Date | null): string | null => value === null ? null
  : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const isoTime = (value: string | Date | null): string | null => value === null ? null
  : value instanceof Date ? value.toISOString() : String(value);
const dayNumber = (value: string): number => Date.parse(`${value}T00:00:00Z`) / 86_400_000;
const addDays = (date: string, amount: number): string => new Date((dayNumber(date) + amount) * 86_400_000).toISOString().slice(0, 10);
const keyOf = (config: Readonly<Record<string, JSONValue>>): string | null => typeof config.conditionKey === "string" ? config.conditionKey : null;
const labels = {
  exposure: { NOT_STARTED: "기록 없음", PARTIAL: "학습 중", COMPLETE: "완료" },
  understanding: { UNKNOWN: "기록 없음", WEAK: "보완 필요", OK: "이해함", STRONG: "탄탄함" },
  validation: { NOT_TESTED: "미검증", FAILED: "재검증 필요", PASSED: "검증됨" }
} as const;

const exposureLabel = (values: readonly UnitRow["exposureState"][]): string => !values.length ? "기록 없음"
  : labels.exposure[values.includes("PARTIAL") ? "PARTIAL" : values.every((value) => value === "COMPLETE") ? "COMPLETE" : "NOT_STARTED"];
const understandingLabel = (values: readonly UnitRow["understandingState"][]): string => !values.length ? "기록 없음"
  : labels.understanding[values.includes("WEAK") ? "WEAK" : values.includes("OK") ? "OK" : values.includes("STRONG") ? "STRONG" : "UNKNOWN"];
const validationLabel = (values: readonly UnitRow["validationState"][]): string => !values.length ? "기록 없음"
  : labels.validation[values.includes("FAILED") ? "FAILED" : values.every((value) => value === "PASSED") ? "PASSED" : "NOT_TESTED"];

function materialView(material: LearningMaterial, units: readonly UnitRow[]): LearningWorkspaceMaterial {
  const evidence = units.filter((unit) => unit.materialId === material.id);
  const progress = deriveMaterialProgress({
    materialId: material.id, unitType: material.unitType, explicitStatus: material.status,
    totalUnits: material.startUnit && material.startUnit > 1 ? null : material.totalUnits,
    scopedRange: material.startUnit && material.totalUnits ? { startSequence: material.startUnit, endSequence: material.totalUnits } : null,
    units: evidence.map((unit) => ({ unitId: unit.id, sequenceNo: unit.sequenceNo,
      workloadCompleted: unit.exposureState === "COMPLETE", exposureState: unit.exposureState,
      understandingState: unit.understandingState, validationState: unit.validationState }))
  });
  return {
    id: material.id, title: material.title, stageId: material.stageId, materialType: material.materialType,
    unitType: material.unitType, totalUnits: material.totalUnits, startUnit: material.startUnit, state: progress.state,
    completedUnits: progress.completedUnits, totalScopedUnits: progress.totalScopedUnits, progressPercent: progress.progressPercent,
    exposure: exposureLabel(evidence.map((unit) => unit.exposureState)),
    understanding: understandingLabel(evidence.map((unit) => unit.understandingState)),
    validation: validationLabel(evidence.map((unit) => unit.validationState))
  };
}

function assessmentSort(row: AssessmentRow): string | null {
  return isoTime(row.dueAt) ?? isoDate(row.dueDate);
}

function activityView(row: ActivityRow) {
  const occurredAt = isoTime(row.occurredAt)!;
  if (row.kind === "focus") return { id: row.id, label: "집중 세션", detail: `${row.minutes ?? 0}분`, occurredAt };
  if (row.kind === "task") return { id: row.id, label: "학습 완료", detail: row.title, occurredAt };
  return { id: row.id, label: "학습 기록", detail: row.title.replaceAll("_", " "), occurredAt };
}

export async function loadLearningWorkspace(): Promise<LearningWorkspaceModel> {
  const today = seoulDate();
  try {
    const sql = getWebSql();
    const userId = getWebUserId();
    const base = await loadLearningContexts();
    const [stages, materials, units, policies, items, assessments, tasks, resolvedTargets, activities] = await Promise.all([
      sql<LearningStage[]>`select id,user_id "userId",work_context_id "workContextId",title,position,status,
        completion_mode "completionMode",transition_mode "transitionMode",target_start_date "targetStartDate",
        target_end_date "targetEndDate",config,created_at "createdAt",updated_at "updatedAt"
        from public.learning_stages where user_id=${userId} and status<>'ARCHIVED' order by work_context_id,position`,
      sql<LearningMaterial[]>`select id,user_id "userId",work_context_id "workContextId",stage_id "stageId",title,
        material_type "materialType",role,tracking_mode "trackingMode",unit_type "unitType",total_units::float8 "totalUnits",
        start_unit::float8 "startUnit",status,source_reference "sourceReference",config,created_at "createdAt",updated_at "updatedAt"
        from public.learning_materials where user_id=${userId} and status<>'ARCHIVED' order by work_context_id,created_at`,
      sql<UnitRow[]>`select id,work_context_id "workContextId",material_id "materialId",sequence_no "sequenceNo",
        exposure_state "exposureState",understanding_state "understandingState",validation_state "validationState"
        from public.learning_units where user_id=${userId} order by work_context_id,position`,
      sql<LearningAllocationPolicy[]>`select id,user_id "userId",work_context_id "workContextId",stage_id "stageId",name,
        profile_type "profileType",activation_condition "activationCondition",recovery_mode "recoveryMode",priority,active,config,
        created_at "createdAt",updated_at "updatedAt" from public.learning_allocation_policies where user_id=${userId} and active=true`,
      sql<LearningAllocationItem[]>`select id,user_id "userId",allocation_policy_id "allocationPolicyId",material_id "materialId",
        target_units::float8 "targetUnits",minimum_units::float8 "minimumUnits",estimated_minutes_min "estimatedMinutesMin",
        estimated_minutes_max "estimatedMinutesMax",position,active,created_at "createdAt",updated_at "updatedAt"
        from public.learning_allocation_items where user_id=${userId} and active=true`,
      sql<AssessmentRow[]>`select id,course_context_id "workContextId",title,due_date "dueDate",due_at "dueAt"
        from public.course_assessments where user_id=${userId} and (due_date>=${today} or due_at>=now()) order by coalesce(due_at,due_date::timestamptz)`,
      sql<ActiveTaskRow[]>`select t.id "taskId",x.id "targetId",t.work_context_id "workContextId",x.material_id "materialId",t.title,
        x.assigned_units "assignedUnits",x.start_sequence "startSequence",x.end_sequence "endSequence",
        x.allocation_policy_id "allocationPolicyId",p.name "policyName",t.estimated_minutes "estimatedMinutes"
        from public.task_learning_targets x join public.tasks t on t.id=x.task_id and t.user_id=x.user_id
        left join public.learning_allocation_policies p on p.id=x.allocation_policy_id and p.user_id=x.user_id
        where x.user_id=${userId} and x.execution_status='PENDING' and x.material_id is not null and x.assigned_units is not null
          and t.status in ('INBOX','PLANNED','IN_PROGRESS','BLOCKED','WAITING_FOR_USER')`,
      sql<ResolvedTargetRow[]>`select x.material_id "materialId",x.materialization_key "materializationKey",
        x.execution_status "executionStatus",x.recovery_mode "recoveryMode",x.assigned_units "assignedUnits",
        x.resolved_at "resolvedAt",t.planned_date::text "planDate"
        from public.task_learning_targets x join public.tasks t on t.id=x.task_id and t.user_id=x.user_id
        where x.user_id=${userId} and x.execution_status<>'PENDING' and x.material_id is not null and x.assigned_units is not null
        order by x.resolved_at desc`,
      sql<ActivityRow[]>`select * from (
        select f.id,t.work_context_id "workContextId",'focus'::text kind,t.title,f.actual_minutes minutes,f.ended_at "occurredAt"
          from public.focus_sessions f join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
          where f.user_id=${userId} and f.ended_at is not null and t.work_context_id is not null
        union all select t.id,t.work_context_id,'task',t.title,null,t.completed_at from public.tasks t
          where t.user_id=${userId} and t.completed_at is not null and t.work_context_id is not null and t.execution_mode='learning_required'
        union all select e.id,w.id,'event',e.event_type,null,e.occurred_at from public.domain_events e
          join public.tasks t on t.id=e.aggregate_id and e.aggregate_type='task' join public.work_contexts w on w.id=t.work_context_id
          where e.user_id=${userId} and e.event_type like 'learning_%'
      ) activity order by "occurredAt" desc limit 100`
    ]);

    const contexts = [...base.courses.map((value) => ({ ...value, kind: "course" as const })),
      ...base.certifications.map((value) => ({ ...value, kind: "certification" as const }))];
    const built: LearningWorkspaceContext[] = contexts.map((context) => {
      const contextStages = stages.filter((stage) => stage.workContextId === context.id);
      const activeStage = contextStages.find((stage) => stage.status === "ACTIVE") ?? contextStages.find((stage) => stage.status !== "COMPLETED") ?? null;
      const contextMaterials = materials.filter((material) => material.workContextId === context.id);
      const materialViews = contextMaterials.map((material) => materialView(material, units));
      const contextPolicies = policies.filter((policy) => policy.workContextId === context.id);
      const allocation = resolveLearningAllocation({
        activeStageId: activeStage?.id ?? null,
        stages: contextStages.map((stage) => ({ stageId: stage.id, key: keyOf(stage.config), status: stage.status })),
        materials: contextMaterials.map((material) => ({ materialId: material.id, key: keyOf(material.config), stageId: material.stageId, status: material.status })),
        policies: contextPolicies, items, capacity: null, todayOverride: null, fallbackItems: []
      });
      const proposed = activeStage ? proposeLearningTasks({ workContextId: context.id, stageId: activeStage.id, planDate: today,
        importance: context.strategicImportance ?? 3, materializationKeyPrefix: `learning:${today}:${context.id}`,
        allocation, materials: contextMaterials.map((material) => ({ materialId: material.id, title: material.title,
          unitType: material.unitType, sequenceMode: material.totalUnits === null ? "OPEN_ENDED" : "BOUNDED",
          units: units.filter((unit) => unit.materialId === material.id && unit.sequenceNo !== null).map((unit) => ({
            learningUnitId: unit.id, sequenceNo: unit.sequenceNo!, exposureState: unit.exposureState })) })) }) : null;
      const activeTasks = tasks.filter((task) => task.workContextId === context.id);
      const activeViews: LearningWorkspaceAction[] = activeTasks.map((task) => ({ kind: "task", taskId: task.taskId,
        targetId: task.targetId, materialId: task.materialId, allocationPolicyId: task.allocationPolicyId, title: task.title, assignedUnits: task.assignedUnits,
        startSequence: task.startSequence, endSequence: task.endSequence, policyName: task.policyName, source: "CANONICAL_TASK", reasons: [],
        estimatedMinutes: task.estimatedMinutes, proposal: null }));
      let recoveryNeedsReview = false;
      const proposalViews: LearningWorkspaceAction[] = (proposed?.proposals ?? []).flatMap((proposal) => {
        if (activeTasks.some((task) => task.materialId === proposal.materialId)) return [];
        if (resolvedTargets.some((target) => target.materializationKey === proposal.materializationKey)) return [];
        const previousResolution = resolvedTargets.find((target) => target.materialId === proposal.materialId && target.planDate < today);
        if (previousResolution?.executionStatus === "SKIPPED" && previousResolution.recoveryMode) {
          const recovery = deriveLearningRecovery({ recoveryMode: previousResolution.recoveryMode,
            normalTargetUnits: proposal.assignedUnits, missedUnits: previousResolution.assignedUnits,
            existingPendingUnits: 0, carryForwardLimitUnits: null });
          if (recovery.proposedNextEligibleDayUnits === null) { recoveryNeedsReview = true; return []; }
        }
        return [{ kind: "proposal" as const, taskId: null, targetId: null,
          materialId: proposal.materialId, allocationPolicyId: proposal.allocationPolicyId, title: proposal.title, assignedUnits: proposal.assignedUnits,
          startSequence: proposal.startSequence, endSequence: proposal.endSequence, policyName: proposal.allocationPolicyName,
          source: proposal.source, reasons: proposal.reasons, estimatedMinutes: proposal.estimatedMinutes ?? null, proposal }];
      });
      const actionViews: LearningWorkspaceAction[] = [...activeViews, ...proposalViews];
      const contextAssessments = assessments.filter((assessment) => assessment.workContextId === context.id).map((assessment) => ({
        id: assessment.id, title: assessment.title, dueDate: isoDate(assessment.dueDate), dueAt: isoTime(assessment.dueAt), sortAt: assessmentSort(assessment)
      }));
      if (context.kind === "certification" && context.examDate && context.examDate >= today
        && !contextAssessments.some((assessment) => assessment.dueDate === context.examDate)) {
        contextAssessments.push({ id: `certification-exam:${context.id}`, title: "시험", dueDate: context.examDate, dueAt: null, sortAt: context.examDate });
      }
      contextAssessments.sort((left, right) => (left.sortAt ?? "9999").localeCompare(right.sortAt ?? "9999"));
      const nextAssessment = contextAssessments[0] ?? null;
      const stageMaterials = materialViews.filter((material) => material.stageId === activeStage?.id);
      const materialForecasts = stageMaterials.map((material) => {
        const allocationItem = actionViews.find((item) => item.materialId === material.id);
        return material.totalScopedUnits !== null && allocationItem ? projectMaterialCompletion({ materialId: material.id,
          remainingUnits: Math.max(0, material.totalScopedUnits - material.completedUnits),
          days: Array.from({ length: 90 }, (_, index) => ({ date: addDays(today, index + 1), eligible: true,
            materialUnitCapacity: { [material.id]: allocationItem.assignedUnits } })) }) : null;
      });
      const forecastDefensible = stageMaterials.length > 0 && materialForecasts.every((forecast) => forecast?.status === "PROJECTED" || forecast?.status === "ALREADY_COMPLETE");
      const projected = forecastDefensible ? materialForecasts.map((forecast) => forecast?.projectedCompletionDate ?? today).sort().at(-1) ?? null : null;
      const due = nextAssessment?.sortAt?.slice(0, 10) ?? null;
      const scheduleSlackDays = projected && due ? dayNumber(due) - dayNumber(projected) : null;
      const forecastStatus = forecastDefensible ? projected === today ? "ALREADY_COMPLETE" as const : "PROJECTED" as const
        : materialForecasts.some((forecast) => forecast?.status === "BEYOND_HORIZON") ? "BEYOND_HORIZON" as const : "UNKNOWN" as const;
      const risk = Boolean(projected && due && projected > due);
      const unknown = !risk && (recoveryNeedsReview || contextMaterials.length === 0 || !activeStage || !forecastDefensible
        || nextAssessment === null || materialViews.some((material) => material.totalScopedUnits === null) || allocation.status !== "RESOLVED");
      const state = risk ? "risk" : unknown ? "unknown" : projected && due && dayNumber(due) - dayNumber(projected) < 7 ? "attention" : "normal";
      const statusLine = contextMaterials.length === 0 ? "학습 자료 확인 필요"
        : materialViews.some((material) => material.totalScopedUnits === null) ? "전체 분량 확인 필요"
        : materialViews.some((material) => material.completedUnits > 0) ? "현재 진도 확인됨" : "시작 전";
      const policyViews: LearningWorkspacePolicy[] = contextPolicies.map((policy) => ({ id: policy.id, name: policy.name,
        profileType: policy.profileType, recoveryMode: policy.recoveryMode, priority: policy.priority,
        items: items.filter((item) => item.allocationPolicyId === policy.id).map((item) => ({ id: item.id, materialId: item.materialId,
          materialTitle: contextMaterials.find((material) => material.id === item.materialId)?.title ?? "학습 자료", targetUnits: item.targetUnits })) }));
      const stageViews: LearningWorkspaceStage[] = contextStages.map((stage) => ({ id: stage.id, title: stage.title,
        position: stage.position, status: stage.status, completionMode: stage.completionMode }));
      return {
        id: context.id, kind: context.kind, title: context.title, strategicImportance: context.strategicImportance,
        commitmentLevel: context.commitmentLevel, term: "term" in context ? context.term : null,
        target: context.kind === "course" ? context.targetGrade : context.targetOutcome,
        instructor: context.kind === "course" ? context.instructor : null,
        studyMode: context.kind === "certification" ? context.studyMode : null,
        currentLevel: context.kind === "certification" ? context.currentLevel : null,
        startDate: context.startDate, endDate: context.endDate,
        activeStage: activeStage ? stageViews.find((stage) => stage.id === activeStage.id) ?? null : null,
        stages: stageViews, materials: materialViews, assessments: contextAssessments, nextAssessment, actions: actionViews,
        policies: policyViews, state, stateLabel: risk ? "위험" : unknown ? "확인 필요" : state === "attention" ? "주의" : "정상",
        statusLine, forecastLabel: projected ? `${activeStage?.title ?? "현재 단계"} 예상 완료 ${projected.slice(5).replace("-", "/")}` : "예상 완료 계산 불가",
        forecastDetail: projected && due ? `일정 여유 ${dayNumber(due) - dayNumber(projected)}일`
          : materialForecasts.some((forecast) => forecast?.status === "BEYOND_HORIZON") ? "현재 계획으로는 90일 범위 밖입니다." : "전체 분량 또는 일일 학습량이 필요합니다.",
        forecast: { status: forecastStatus, projectedCompletionDate: projected, scheduleSlackDays },
        activity: activities.filter((item) => item.workContextId === context.id).slice(0, 12).map(activityView)
      };
    });
    const allUpcoming = built.flatMap((context) => context.assessments.map((assessment) => ({ context, assessment })))
      .filter((item) => item.assessment.sortAt).sort((left, right) => left.assessment.sortAt!.localeCompare(right.assessment.sortAt!));
    const nearestItem = allUpcoming[0];
    const nearest = nearestItem ? { contextTitle: nearestItem.context.title, eventTitle: nearestItem.assessment.title,
      dateLabel: nearestItem.assessment.sortAt!.slice(5, 10).replace("-", "/"),
      days: dayNumber(nearestItem.assessment.sortAt!.slice(0, 10)) - dayNumber(today) } : null;
    return { configured: base.configured, error: base.error, today, nearest,
      riskTitles: built.filter((context) => context.state === "risk").map((context) => context.title),
      unknownTitles: built.filter((context) => context.state === "unknown").map((context) => context.title),
      courses: built.filter((context) => context.kind === "course"), certifications: built.filter((context) => context.kind === "certification") };
  } catch (error) {
    return { configured: false, error: error instanceof Error ? error.message : "Learning workspace를 불러오지 못했습니다.",
      today, nearest: null, riskTitles: [], unknownTitles: [], courses: [], certifications: [] };
  }
}

export async function findLearningProposal(contextId: string, materialId: string, overrideUnits?: number): Promise<LearningTaskProposal> {
  const model = await loadLearningWorkspace();
  const context = [...model.courses, ...model.certifications].find((item) => item.id === contextId);
  const action = context?.actions.find((item) => item.kind === "proposal" && item.materialId === materialId);
  if (!context || !context.activeStage || !action) throw new Error("현재 실행 가능한 학습 제안을 찾지 못했습니다.");
  if (overrideUnits === undefined && action.proposal) return action.proposal;
  const assignedUnits = overrideUnits ?? action.assignedUnits;
  if (!Number.isInteger(assignedUnits) || assignedUnits <= 0) throw new Error("오늘 학습량은 1 이상이어야 합니다.");
  const material = context.materials.find((item) => item.id === materialId)!;
  const startSequence = action.startSequence;
  const endSequence = startSequence === null ? null : startSequence + assignedUnits - 1;
  const label = material.unitType === "LESSON" ? "강" : material.unitType === "CHAPTER" ? "챕터" : "단위";
  return {
    materializationKey: `learning:${model.today}:${contextId}:${materialId}:${startSequence === null ? `quantity:${assignedUnits}` : `sequence:${startSequence}-${endSequence}`}`,
    workContextId: contextId, stageId: context.activeStage.id, materialId,
    allocationPolicyId: overrideUnits === undefined ? action.allocationPolicyId : null,
    allocationPolicyName: overrideUnits === undefined ? action.policyName : "오늘만 조정", planDate: model.today,
    importance: context.strategicImportance ?? 3, title: `${material.title} ${startSequence === null ? `${assignedUnits}${label}` : startSequence === endSequence ? `${startSequence}${label}` : `${startSequence}~${endSequence}${label}`}`,
    completionCriteria: `${assignedUnits}${label} 학습 완료`, assignedUnits, startSequence, endSequence,
    estimatedMinutes: action.estimatedMinutes,
    learningUnitIds: [], recoveryMode: "MANUAL", source: overrideUnits === undefined ? "PERSISTED_POLICY" : "TODAY_ONLY_OVERRIDE",
    reasons: [{ code: overrideUnits === undefined ? "CURRENT_DETERMINISTIC_PROPOSAL" : "TODAY_ONLY_USER_OVERRIDE", evidence: { temporary: overrideUnits !== undefined } }]
  };
}
