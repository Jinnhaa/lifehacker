"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createWebReplanService, getWebSql, getWebUserId } from "../lib/home-server";
import type { ChiefActionState } from "../lib/home-types";

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
