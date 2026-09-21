"use server";

import { randomUUID } from "node:crypto";
import { zonedDateTimeToUtc, type TaskId } from "@amber/shared";
import { completeManualQuest } from "@amber/core";
import { revalidatePath } from "next/cache";
import { createWebInputService, createWebTaskService } from "../../lib/work-server";
import { createWebReplanService } from "../../lib/home-server";
import type { WorkActionState } from "../../lib/work-types";
import { getWebSql, getWebUserId } from "../../lib/web-runtime";

const profileTimeZone = async (): Promise<string> => {
  const rows = await getWebSql()<{ timezone: string }[]>`select timezone from public.profiles where id=${getWebUserId()}`;
  if (!rows[0]) throw new Error("사용자 profile을 찾지 못했습니다.");
  return rows[0].timezone;
};

const deadline = async (value: FormDataEntryValue | null): Promise<Date | null> => {
  const text = String(value ?? "").trim();
  return text ? zonedDateTimeToUtc(text, await profileTimeZone()) : null;
};

const minutes = (value: FormDataEntryValue | null): number | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("예상 시간은 1분 이상의 정수로 입력해 주세요.");
  return parsed;
};

const failure = (error: unknown, fallback: string): WorkActionState => ({
  status: "error", message: error instanceof Error ? error.message : fallback
});

export const decideWorkCandidateAction = async (_previous: WorkActionState, formData: FormData): Promise<WorkActionState> => {
  try {
    const decision = formData.get("decision");
    if (decision !== "confirm" && decision !== "dismiss") return { status: "error", message: "확인 결정을 선택해 주세요." };
    const contextValue = String(formData.get("workContextId") ?? "");
    await createWebInputService(getWebSql()).decideTaskCandidate({
      userId: getWebUserId(), parsedEntityId: String(formData.get("candidateId") ?? ""), decision,
      ...(decision === "confirm" && {
        title: String(formData.get("title") ?? "").trim(),
        estimatedMinutes: minutes(formData.get("estimatedMinutes")),
        workContextId: contextValue || null
      })
    });
    revalidatePath("/work");
    revalidatePath("/");
    return { status: "success", message: decision === "dismiss" ? "할 일 후보에서 제외했습니다." : "확인한 후보를 할 일로 등록했습니다." };
  } catch (error) {
    return failure(error, "후보 처리에 실패했습니다.");
  }
};

export const updateWorkTaskAction = async (_previous: WorkActionState, formData: FormData): Promise<WorkActionState> => {
  try {
    const contextValue = String(formData.get("workContextId") ?? "");
    await createWebTaskService(getWebSql()).updateTask({
      userId: getWebUserId(), taskId: String(formData.get("taskId") ?? ""),
      title: String(formData.get("title") ?? "").trim(),
      internalDeadline: await deadline(formData.get("targetDeadline")),
      estimatedMinutes: minutes(formData.get("estimatedMinutes")), workContextId: contextValue || null,
      source: "work_board"
    });
    revalidatePath("/work");
    revalidatePath("/");
    return { status: "success", message: "할 일 정보를 수정했습니다." };
  } catch (error) {
    return failure(error, "할 일 수정에 실패했습니다.");
  }
};

export const completeWorkTaskAction = async (_previous: WorkActionState, formData: FormData): Promise<WorkActionState> => {
  try {
    const sql = getWebSql();
    const userId = getWebUserId();
    const taskId = String(formData.get("taskId") ?? "");
    const result = await completeManualQuest(sql, userId, taskId as TaskId);
    if (!result.duplicate) await createWebReplanService(sql).processLatestTrigger(userId, await profileTimeZone(), new Date());
    revalidatePath("/work");
    revalidatePath("/");
    return { status: "success", message: result.duplicate ? "이미 완료된 일입니다." : "완료하고 목표 진행률과 계획을 갱신했습니다." };
  } catch (error) {
    return failure(error, "할 일 완료 처리에 실패했습니다.");
  }
};

export const createWorkTaskAction = async (_previous: WorkActionState, formData: FormData): Promise<WorkActionState> => {
  try {
    await createWebTaskService(getWebSql()).createTask({
      userId: getWebUserId(), title: String(formData.get("title") ?? "").trim(),
      internalDeadline: await deadline(formData.get("targetDeadline")), executionMode: "standard",
      importance: 3, source: "work_board", idempotencyKey: `work-board:create:${randomUUID()}`
    });
    revalidatePath("/work");
    revalidatePath("/");
    return { status: "success", message: "새 할 일을 추가했습니다." };
  } catch (error) {
    return failure(error, "할 일 추가에 실패했습니다.");
  }
};

export const moveWorkTaskAction = async (_previous: WorkActionState, formData: FormData): Promise<WorkActionState> => {
  try {
    const plannedDate = String(formData.get("plannedDate") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) throw new Error("옮길 날짜를 확인해 주세요.");
    await createWebTaskService(getWebSql()).updateTask({
      userId: getWebUserId(), taskId: String(formData.get("taskId") ?? ""), plannedDate, source: "work_calendar_drag"
    });
    revalidatePath("/work");
    revalidatePath("/");
    return { status: "success", message: "Planned Day를 옮겼습니다. 마감일은 변경하지 않았습니다." };
  } catch (error) {
    return failure(error, "Planned Day 변경에 실패했습니다.");
  }
};

export const updateWorkEstimateAction = async (_previous: WorkActionState, formData: FormData): Promise<WorkActionState> => {
  try {
    await createWebTaskService(getWebSql()).updateTask({
      userId: getWebUserId(), taskId: String(formData.get("taskId") ?? ""),
      estimatedMinutes: minutes(formData.get("estimatedMinutes")), source: "work_calendar_estimate"
    });
    revalidatePath("/work");
    revalidatePath("/");
    return { status: "success", message: "예상시간을 반영했습니다." };
  } catch (error) {
    return failure(error, "예상시간 수정에 실패했습니다.");
  }
};
