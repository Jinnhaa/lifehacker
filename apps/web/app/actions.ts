"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createWebArtifactReviewService,
  createWebFocusService,
  createWebMorningService,
  createWebProjectRuntimeService,
  createWebReplanService,
  getWebSql,
  getWebUserId
} from "../lib/home-server";
import type { ChiefActionState, RuntimeActionState } from "../lib/home-types";
import { zonedDateTimeToUtc } from "@amber/shared";
import { completeManualQuest, completeManualRoutine } from "@amber/core";
import type { TaskId } from "@amber/shared";

const profileTimeZone = async (): Promise<string> => {
  const rows = await getWebSql()<{ timezone: string }[]>`select timezone from public.profiles where id=${getWebUserId()}`;
  if (!rows[0]) throw new Error("사용자 profile을 찾지 못했습니다.");
  return rows[0].timezone;
};

const run = async (text: string): Promise<ChiefActionState> => {
  try {
    const sql = getWebSql();
    const result = await createWebReplanService(sql).handleReplanMessage({
      userId: getWebUserId(), timeZone: await profileTimeZone(), text,
      messageId: `web:${randomUUID()}`, receivedAt: new Date()
    });
    if (!result.handled) return {
      status: "error",
      message: "지원하는 요청은 휴식/불가 시간, 현재 작업 미루기, 특정 작업 우선, 오늘 할 일 줄이기, 특정 시간 이후 작업 제외입니다."
    };
    revalidatePath("/");
    return { status: "success", message: result.reply ?? "일정 변경안을 만들었습니다." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "일정 조정에 실패했습니다." };
  }
};

export const requestChiefReplan = async (_previous: ChiefActionState, formData: FormData): Promise<ChiefActionState> => {
  const text = String(formData.get("command") ?? "").trim();
  if (!text || text.length > 500) return { status: "error", message: "1–500자의 일정 조정 요청을 입력해 주세요." };
  return run(text);
};

export const decideChiefReplan = async (_previous: ChiefActionState, formData: FormData): Promise<ChiefActionState> => {
  const decision = formData.get("decision");
  if (decision !== "approve" && decision !== "reject") return { status: "error", message: "검토 결정을 확인할 수 없습니다." };
  return run(decision === "approve" ? "승인" : "거절");
};

export const editTodayPlan = async (_previous: ChiefActionState, formData: FormData): Promise<ChiefActionState> => {
  try {
    const planId = String(formData.get("planId") ?? "");
    const itemId = String(formData.get("itemId") ?? "");
    const kind = formData.get("editKind") === "exclude" ? "exclude" as const : "reschedule" as const;
    if (!planId || !itemId) return { status: "error", message: "수정할 계획 항목을 확인할 수 없습니다." };
    const date = String(formData.get("date") ?? "");
    const localTime = String(formData.get("localTime") ?? "");
    const durationMinutes = Number(formData.get("durationMinutes"));
    const timeZone = await profileTimeZone();
    const edit = kind === "exclude" ? { kind, itemId } : {
      kind, itemId,
      start: zonedDateTimeToUtc(`${date}T${localTime}:00`, timeZone),
      durationMinutes
    };
    const key = createHash("sha256").update(JSON.stringify({ planId, edit: {
      ...edit, ...(edit.kind === "reschedule" ? { start: edit.start.toISOString() } : {})
    }})).digest("hex");
    const result = await createWebReplanService(getWebSql()).editPlan({
      userId: getWebUserId(), planId, edit, idempotencyKey: key, receivedAt: new Date()
    });
    revalidatePath("/");
    return { status: "success", message: `v${result.plan.revisionNo} 변경안을 만들었습니다. Before / After를 확인하고 승인해 주세요.` };
  } catch (error) {
    return runtimeError(error, "계획 변경안을 만들지 못했습니다.");
  }
};

const runtimeError = (error: unknown, fallback: string): RuntimeActionState => ({
  status: "error", message: error instanceof Error ? error.message : fallback
});

export const runMorningAction = async (_previous: RuntimeActionState, formData: FormData): Promise<RuntimeActionState> => {
  try {
    const command = String(formData.get("command") ?? "일어남").trim();
    if (!command || command.length > 500) return { status: "error", message: "Morning 요청을 1–500자로 입력해 주세요." };
    const result = await createWebMorningService(getWebSql()).handleMorningMessage({
      userId: getWebUserId(), timeZone: await profileTimeZone(), text: command,
      messageId: `web-morning:${randomUUID()}`, receivedAt: new Date()
    });
    if (!result.handled) return { status: "error", message: "현재 Morning 단계에서 처리할 수 없는 요청입니다." };
    revalidatePath("/");
    return { status: "success", message: result.reply ?? "Morning 상태를 갱신했습니다." };
  } catch (error) {
    return runtimeError(error, "오늘 계획 처리에 실패했습니다.");
  }
};

export const runFocusAction = async (_previous: RuntimeActionState, formData: FormData): Promise<RuntimeActionState> => {
  try {
    const command = String(formData.get("command") ?? "").trim();
    if (!command || command.length > 500) return { status: "error", message: "Focus 요청을 확인해 주세요." };
    const result = await createWebFocusService(getWebSql()).handleFocusMessage({
      userId: getWebUserId(), timeZone: await profileTimeZone(), text: command,
      messageId: `web-focus:${randomUUID()}`, receivedAt: new Date()
    });
    if (!result.handled) return { status: "error", message: "현재 Focus 단계에서 처리할 수 없는 요청입니다." };
    revalidatePath("/");
    return { status: "success", message: result.reply ?? "Focus 상태를 갱신했습니다." };
  } catch (error) {
    return runtimeError(error, "Focus 처리에 실패했습니다.");
  }
};

export const completeHomeQuestAction = async (_previous: RuntimeActionState, formData: FormData): Promise<RuntimeActionState> => {
  try {
    const taskId = String(formData.get("taskId") ?? "");
    const stepId = String(formData.get("stepId") ?? "");
    const occurrenceId = String(formData.get("occurrenceId") ?? "");
    if ((taskId && !/^[0-9a-f-]{36}$/i.test(taskId)) || (stepId && !/^[0-9a-f-]{36}$/i.test(stepId))
      || (occurrenceId && !/^[0-9a-f-]{36}$/i.test(occurrenceId)) || (!taskId && !occurrenceId)) {
      return { status: "error", message: "완료할 Quest를 확인할 수 없습니다." };
    }
    const sql = getWebSql();
    const result = occurrenceId ? (await completeManualRoutine(sql, getWebUserId(), occurrenceId), "routine" as const)
      : await completeManualQuest(sql, getWebUserId(), taskId as TaskId, stepId || undefined);
    if (result !== "step") await createWebReplanService(sql).processLatestTrigger(getWebUserId(), await profileTimeZone(), new Date());
    revalidatePath("/");
    revalidatePath("/work");
    return { status: "success", message: result === "step" ? "Step을 완료했습니다." : "Quest를 완료하고 남은 계획을 확인했습니다." };
  } catch (error) {
    return runtimeError(error, "Quest 완료 처리에 실패했습니다.");
  }
};

export const reviewArtifactAction = async (_previous: RuntimeActionState, formData: FormData): Promise<RuntimeActionState> => {
  try {
    const decision = formData.get("decision");
    if (decision !== "accept" && decision !== "reject" && decision !== "revise") {
      return { status: "error", message: "Artifact 검토 결정을 확인할 수 없습니다." };
    }
    const artifactId = String(formData.get("artifactId") ?? "");
    const workContextId = String(formData.get("workContextId") ?? "");
    const artifactContentHash = String(formData.get("contentHash") ?? "");
    const feedback = String(formData.get("feedback") ?? "").trim();
    if (decision === "revise" && !feedback) return { status: "error", message: "수정 요청 내용을 입력해 주세요." };
    const result = await createWebArtifactReviewService(getWebSql()).review({
      userId: getWebUserId(), workContextId, artifactId, artifactContentHash, decision,
      ...(decision === "revise" ? { revisionInstruction: feedback } : {}),
      ...(feedback ? { reason: feedback } : {}),
      idempotencyKey: `web-artifact-review:${artifactId}:${artifactContentHash}:${decision}:${createHash("sha256").update(feedback).digest("hex")}`
    }, await profileTimeZone());
    revalidatePath("/");
    const message = decision === "accept" ? "Artifact를 승인하고 프로젝트 상태를 다시 계산했습니다."
      : decision === "revise" ? `수정본 생성을 요청했습니다. (${result.revisionExecution?.status ?? "처리됨"})`
        : "Artifact를 거절했습니다.";
    return { status: "success", message };
  } catch (error) {
    return runtimeError(error, "Artifact 검토에 실패했습니다.");
  }
};

export const runProjectRuntimeAction = async (_previous: RuntimeActionState, formData: FormData): Promise<RuntimeActionState> => {
  try {
    const workContextId = String(formData.get("workContextId") ?? "");
    if (!workContextId) return { status: "error", message: "프로젝트를 선택해 주세요." };
    const result = await createWebProjectRuntimeService(getWebSql()).startOrContinue({
      userId: getWebUserId(), workContextId, timeZone: await profileTimeZone()
    });
    revalidatePath("/");
    const message = result.executions.some((item) => item.status === "waiting_for_review")
      ? "AI 산출물이 Review Inbox에 도착했습니다."
      : result.summary.nextAction === "review_proposal" ? "Backlog 제안을 검토해 주세요."
        : `${result.summary.project.title}: ${result.summary.stateLabel}`;
    return { status: "success", message };
  } catch (error) {
    return runtimeError(error, "Project AI 실행을 시작하지 못했습니다.");
  }
};

export const decideProjectBacklogAction = async (_previous: RuntimeActionState, formData: FormData): Promise<RuntimeActionState> => {
  try {
    const workContextId = String(formData.get("workContextId") ?? "");
    const decision = formData.get("decision");
    if (!workContextId || (decision !== "approve" && decision !== "reject")) {
      return { status: "error", message: "Project backlog 결정을 확인할 수 없습니다." };
    }
    const acceptedItemKeys = decision === "approve"
      ? formData.getAll("acceptedItemKey").map(String)
      : [];
    const result = await createWebProjectRuntimeService(getWebSql()).decideBacklog({
      userId: getWebUserId(), workContextId, timeZone: await profileTimeZone(), acceptedItemKeys,
      userReason: decision === "reject" ? "Home Project PM에서 제안 거절" : "Home Project PM에서 선택 승인"
    });
    revalidatePath("/");
    const reviewReady = result.executions.some((item) => item.status === "waiting_for_review");
    return {
      status: "success",
      message: decision === "reject" ? "Backlog 제안을 반영하지 않았습니다."
        : reviewReady ? "승인한 AI 작업의 산출물이 Review Inbox에 도착했습니다."
          : "선택한 Backlog를 Task와 TaskStep으로 반영했습니다."
    };
  } catch (error) {
    return runtimeError(error, "Project backlog 결정에 실패했습니다.");
  }
};
