"use server";

import { randomUUID } from "node:crypto";
import { SupabaseLearningTaskExecutionRepository } from "@amber/core";
import type { CertificationStudyMode, CommitmentLevel, ContextCommonInput, LearningTaskExecutionCommand } from "@amber/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createWebContextManagementService } from "../../lib/context-management-server";
import { findLearningProposal } from "../../lib/learning-workspace-server";
import type { LearningWorkspaceActionState } from "../../lib/learning-workspace-types";
import { planCurrentStudyPosition, type StudyPositionUnit } from "../../lib/university-study-position";
import type { ContextActionState } from "../../lib/context-management-types";
import { getWebSql, getWebUserId } from "../../lib/web-runtime";

const optional = (formData: FormData, key: string): string | null => String(formData.get(key) ?? "").trim() || null;
const common = (formData: FormData): ContextCommonInput => {
  const importance = optional(formData, "strategicImportance");
  return {
    title: String(formData.get("title") ?? "").trim(),
    strategicImportance: importance === null ? null : Number(importance),
    commitmentLevel: optional(formData, "commitmentLevel") as CommitmentLevel | null,
    startDate: optional(formData, "startDate"), endDate: optional(formData, "endDate"),
    internalStartDate: optional(formData, "internalStartDate")
  };
};
const result = (status: ContextActionState["status"], message: string): ContextActionState => ({ status, message });
const refresh = (): void => { revalidatePath("/learning"); revalidatePath("/work"); revalidatePath("/"); };

export const saveLearningContextAction = async (_state: ContextActionState, formData: FormData): Promise<ContextActionState> => {
  try {
    const kind = formData.get("kind");
    const intent = formData.get("intent");
    const contextId = optional(formData, "contextId");
    if (kind !== "course" && kind !== "certification") throw new Error("학습 Context 종류를 확인해 주세요.");
    const service = createWebContextManagementService(getWebSql());
    const userId = getWebUserId();
    if (intent === "archive") {
      if (!contextId) throw new Error("보관할 Context를 찾지 못했습니다.");
      await service.archive(userId, contextId, kind);
      refresh();
      return result("success", "Context를 보관했습니다.");
    }
    if (intent !== "create" && intent !== "update") throw new Error("저장 요청을 확인해 주세요.");
    if (kind === "course") {
      const profile = { targetGrade: optional(formData, "targetGrade"), term: optional(formData, "term"), instructor: optional(formData, "instructor") };
      if (intent === "create") await service.createCourse(userId, common(formData), profile);
      else {
        if (!contextId) throw new Error("수정할 Course를 찾지 못했습니다.");
        await service.updateCourse(userId, contextId, common(formData), profile);
      }
    } else {
      const profile = {
        targetOutcome: optional(formData, "targetOutcome"), examDate: optional(formData, "examDate"),
        studyMode: optional(formData, "studyMode") as CertificationStudyMode | null,
        currentLevel: optional(formData, "currentLevel")
      };
      if (intent === "create") await service.createCertification(userId, common(formData), profile);
      else {
        if (!contextId) throw new Error("수정할 Certification을 찾지 못했습니다.");
        await service.updateCertification(userId, contextId, common(formData), profile);
      }
    }
    refresh();
    return result("success", intent === "create" ? "새 Context를 만들었습니다." : "Context를 수정했습니다.");
  } catch (error) {
    return result("error", error instanceof Error ? error.message : "학습 Context 저장에 실패했습니다.");
  }
};

const uuid = z.string().uuid();
const positiveInt = z.coerce.number().int().positive();
const workspaceResult = (status: LearningWorkspaceActionState["status"], message: string): LearningWorkspaceActionState => ({ status, message });

export async function executeLearningAction(_state: LearningWorkspaceActionState, form: FormData): Promise<LearningWorkspaceActionState> {
  try {
    const contextId = uuid.parse(form.get("contextId"));
    const materialId = uuid.parse(form.get("materialId"));
    let taskId = String(form.get("taskId") ?? "");
    let targetId = String(form.get("targetId") ?? "");
    const requestedUnits = String(form.get("overrideUnits") ?? "").trim();
    if (!taskId || !targetId) {
      const proposal = await findLearningProposal(contextId, materialId, requestedUnits ? positiveInt.parse(requestedUnits) : undefined);
      const created = await new SupabaseLearningTaskExecutionRepository(getWebSql()).materialize(getWebUserId(), proposal);
      taskId = created.taskId;
      targetId = created.targetId;
    }
    uuid.parse(taskId); uuid.parse(targetId);
    const outcome = String(form.get("outcome") ?? "");
    let command: LearningTaskExecutionCommand;
    if (outcome === "COMPLETED") command = { outcome: "COMPLETED" };
    else if (outcome === "PARTIAL") {
      const completedUnits = z.coerce.number().int().nonnegative().parse(form.get("completedUnits"));
      const assignedUnits = positiveInt.parse(form.get("assignedUnits"));
      command = completedUnits === 0 ? { outcome: "SKIPPED", existingPendingUnits: 0, carryForwardLimitUnits: null }
        : completedUnits === assignedUnits ? { outcome: "COMPLETED" } : { outcome: "PARTIAL", completedUnits };
    } else if (outcome === "SKIPPED") command = { outcome: "SKIPPED", existingPendingUnits: 0, carryForwardLimitUnits: null };
    else throw new Error("학습 결과를 확인해 주세요.");
    await new SupabaseLearningTaskExecutionRepository(getWebSql()).applyExecution({
      userId: getWebUserId(), taskId: taskId as Parameters<SupabaseLearningTaskExecutionRepository["applyExecution"]>[0]["taskId"], targetId, command
    });
    refresh();
    return workspaceResult("success", command.outcome === "COMPLETED" ? "오늘 학습을 완료했습니다." : command.outcome === "PARTIAL" ? "학습한 범위까지 반영했습니다." : "오늘 학습을 건너뛰었습니다.");
  } catch (error) {
    return workspaceResult("error", error instanceof Error ? error.message : "학습 결과를 반영하지 못했습니다.");
  }
}

export async function recordCurrentStudyPositionAction(
  _state: LearningWorkspaceActionState,
  form: FormData
): Promise<LearningWorkspaceActionState> {
  try {
    const contextId = uuid.parse(form.get("contextId"));
    const materialId = uuid.parse(form.get("materialId"));
    const throughSequence = z.coerce.number().int().nonnegative().parse(form.get("throughSequence"));
    const sql = getWebSql();
    const userId = getWebUserId();
    await sql.begin(async (tx) => {
      const contexts = await tx<{ id: string }[]>`select w.id from public.work_contexts w
        join public.external_references r on r.user_id=w.user_id and r.internal_entity_id=w.id
          and r.source='snowboard' and r.external_type='course' and r.internal_entity_type='work_context' and r.sync_status='active'
        where w.id=${contextId} and w.user_id=${userId} and w.kind='course' and w.status='active' and w.archived_at is null
        for update of w`;
      if (!contexts[0]) throw new Error("현재 Snowboard 과목을 찾지 못했습니다.");
      const materials = await tx<{ id: string }[]>`select id from public.learning_materials
        where user_id=${userId} and work_context_id=${contextId} and status<>'ARCHIVED' order by created_at for update`;
      if (materials.length !== 1 || materials[0]?.id !== materialId) {
        throw new Error("현재 위치를 연결할 단일 학습 범위가 아직 없습니다.");
      }
      const units = await tx<StudyPositionUnit[]>`select id,sequence_no "sequenceNo",exposure_state "exposureState",
        understanding_state "understandingState",validation_state "validationState"
        from public.learning_units where user_id=${userId} and work_context_id=${contextId} and material_id=${materialId}
        order by sequence_no for update`;
      const plan = planCurrentStudyPosition(units, throughSequence);
      for (const unitId of plan.unitIdsToComplete) {
        await tx`update public.learning_units set exposure_state='COMPLETE',updated_at=now()
          where id=${unitId} and user_id=${userId} and work_context_id=${contextId} and material_id=${materialId}`;
      }
      await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,
        correlation_id,payload_version,payload)
        values(${userId},'learning_position_confirmed','work_context',${contextId},'user',now(),${randomUUID()},1,
          ${tx.json({ source: "explicit_user", material_id: materialId, through_sequence: throughSequence,
            affected_learning_unit_ids: plan.unitIdsToComplete })})`;
    });
    refresh();
    return workspaceResult("success", throughSequence === 0 ? "공부 시작 전으로 확인했습니다." : "현재 공부 위치를 반영했습니다.");
  } catch (error) {
    return workspaceResult("error", error instanceof Error ? error.message : "현재 공부 위치를 반영하지 못했습니다.");
  }
}

export async function materializeAdjustedLearningAction(_state: LearningWorkspaceActionState, form: FormData): Promise<LearningWorkspaceActionState> {
  try {
    const contextId = uuid.parse(form.get("contextId"));
    const materialId = uuid.parse(form.get("materialId"));
    const units = positiveInt.parse(form.get("units"));
    const proposal = await findLearningProposal(contextId, materialId, units);
    await new SupabaseLearningTaskExecutionRepository(getWebSql()).materialize(getWebUserId(), proposal);
    refresh();
    return workspaceResult("success", "오늘만 적용했습니다. 기본 학습량은 그대로입니다.");
  } catch (error) {
    return workspaceResult("error", error instanceof Error ? error.message : "오늘 학습량을 적용하지 못했습니다.");
  }
}

export async function saveLearningStageAction(_state: LearningWorkspaceActionState, form: FormData): Promise<LearningWorkspaceActionState> {
  try {
    const sql = getWebSql(); const userId = getWebUserId(); const contextId = uuid.parse(form.get("contextId"));
    const title = z.string().trim().min(1).max(300).parse(form.get("title"));
    const position = positiveInt.parse(form.get("position"));
    const completionMode = z.enum(["MANUAL", "ALL_REQUIRED_MATERIALS", "ASSESSMENT_THRESHOLD"]).parse(form.get("completionMode"));
    await sql`insert into public.learning_stages(user_id,work_context_id,title,position,status,completion_mode,transition_mode,config)
      values(${userId},${contextId},${title},${position},'NOT_STARTED',${completionMode},'SEQUENTIAL','{}'::jsonb)`;
    refresh(); return workspaceResult("success", "학습 단계를 추가했습니다.");
  } catch (error) { return workspaceResult("error", error instanceof Error ? error.message : "학습 단계를 추가하지 못했습니다."); }
}

export async function saveLearningMaterialAction(_state: LearningWorkspaceActionState, form: FormData): Promise<LearningWorkspaceActionState> {
  try {
    const sql = getWebSql(); const userId = getWebUserId(); const contextId = uuid.parse(form.get("contextId"));
    const title = z.string().trim().min(1).max(300).parse(form.get("title"));
    const stageValue = String(form.get("stageId") ?? ""); const stageId = stageValue ? uuid.parse(stageValue) : null;
    const materialType = z.string().trim().min(1).max(100).parse(form.get("materialType"));
    const unitTypeValue = String(form.get("unitType") ?? "").trim();
    const totalValue = String(form.get("totalUnits") ?? "").trim(); const startValue = String(form.get("startUnit") ?? "").trim();
    const totalUnits = totalValue ? positiveInt.parse(totalValue) : null; const startUnit = startValue ? positiveInt.parse(startValue) : null;
    await sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`insert into public.learning_materials(user_id,work_context_id,stage_id,title,material_type,tracking_mode,unit_type,total_units,start_unit,status,config)
        values(${userId},${contextId},${stageId},${title},${materialType},${totalUnits ? "UNIT_COUNT" : "UNTRACKED"},${unitTypeValue || null},${totalUnits},${startUnit},'ACTIVE','{}'::jsonb) returning id`;
      if (totalUnits) {
        const first = startUnit ?? 1;
        const positions = await tx<{ nextPosition: number }[]>`select coalesce(max(position),0)::integer+1 "nextPosition" from public.learning_units where user_id=${userId} and work_context_id=${contextId}`;
        await tx`insert into public.learning_units(user_id,work_context_id,title,position,stage_id,material_id,sequence_no,unit_type)
          select ${userId},${contextId},${title}||' '||sequence_no::text,${positions[0]!.nextPosition}+sequence_no-${first},${stageId},${rows[0]!.id},sequence_no,${unitTypeValue || null}
          from generate_series(${first},${totalUnits}) sequence_no`;
      }
    });
    refresh(); return workspaceResult("success", "학습 자료를 추가했습니다.");
  } catch (error) { return workspaceResult("error", error instanceof Error ? error.message : "학습 자료를 추가하지 못했습니다."); }
}

export async function createDefaultAllocationAction(_state: LearningWorkspaceActionState, form: FormData): Promise<LearningWorkspaceActionState> {
  try {
    const sql = getWebSql(); const userId = getWebUserId(); const contextId = uuid.parse(form.get("contextId"));
    const materialId = uuid.parse(form.get("materialId")); const targetUnits = positiveInt.parse(form.get("targetUnits"));
    await sql.begin(async (tx) => {
      const existing = await tx<{ id: string }[]>`select id from public.learning_allocation_policies
        where user_id=${userId} and work_context_id=${contextId} and profile_type='normal' and active=true order by priority desc limit 1 for update`;
      const policyId = existing[0]?.id ?? (await tx<{ id: string }[]>`insert into public.learning_allocation_policies
        (user_id,work_context_id,name,profile_type,activation_condition,recovery_mode,priority,active,config)
        values(${userId},${contextId},'기본 학습량','normal','{}'::jsonb,'MANUAL',0,true,'{}'::jsonb) returning id`)[0]!.id;
      const positions = await tx<{ nextPosition: number }[]>`select coalesce(max(position),0)::integer+1 "nextPosition"
        from public.learning_allocation_items where user_id=${userId} and allocation_policy_id=${policyId}`;
      await tx`insert into public.learning_allocation_items(user_id,allocation_policy_id,material_id,target_units,position,active)
        values(${userId},${policyId},${materialId},${targetUnits},${positions[0]!.nextPosition},true)`;
    });
    refresh(); return workspaceResult("success", "기본 학습량을 추가했습니다.");
  } catch (error) { return workspaceResult("error", error instanceof Error ? error.message : "기본 학습량을 추가하지 못했습니다."); }
}

export async function updateAllocationItemAction(_state: LearningWorkspaceActionState, form: FormData): Promise<LearningWorkspaceActionState> {
  try {
    const id = uuid.parse(form.get("itemId")); const targetUnits = positiveInt.parse(form.get("targetUnits"));
    await getWebSql()`update public.learning_allocation_items set target_units=${targetUnits},updated_at=now()
      where id=${id} and user_id=${getWebUserId()}`;
    refresh(); return workspaceResult("success", "기본 학습량을 변경했습니다.");
  } catch (error) { return workspaceResult("error", error instanceof Error ? error.message : "기본 학습량을 변경하지 못했습니다."); }
}

export async function updateAllocationPolicyAction(_state: LearningWorkspaceActionState, form: FormData): Promise<LearningWorkspaceActionState> {
  try {
    const id = uuid.parse(form.get("policyId"));
    const recoveryMode = z.enum(["REDISTRIBUTE", "RESET", "CARRY_FORWARD", "MANUAL"]).parse(form.get("recoveryMode"));
    await getWebSql()`update public.learning_allocation_policies set recovery_mode=${recoveryMode},updated_at=now()
      where id=${id} and user_id=${getWebUserId()}`;
    refresh(); return workspaceResult("success", "밀린 학습 처리 방식을 변경했습니다.");
  } catch (error) { return workspaceResult("error", error instanceof Error ? error.message : "밀린 학습 처리 방식을 변경하지 못했습니다."); }
}
