"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createWebArtifactReviewService,
  createWebFocusService,
  createWebMorningService,
  createWebReplanService,
  getWebSql,
  getWebUserId
} from "../lib/home-server";
import type { ChiefActionState, RuntimeActionState } from "../lib/home-types";

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
