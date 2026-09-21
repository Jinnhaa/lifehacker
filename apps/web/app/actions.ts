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

export const saveChiefStatusOverride = async (_previous: ChiefActionState, formData: FormData): Promise<ChiefActionState> => {
  try {
    const text = String(formData.get("statusCorrection") ?? "").trim();
    const scope = formData.get("scope") === "PERSISTENT" ? "PERSISTENT" as const : "TODAY" as const;
    if (!text || text.length > 500) return { status: "error", message: "상태 수정은 1–500자로 입력해 주세요." };
    const sql = getWebSql();
    const userId = getWebUserId();
    const timeZone = await profileTimeZone();
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const tomorrow = new Date(`${date}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const validUntil = scope === "TODAY" ? zonedDateTimeToUtc(`${tomorrow.toISOString().slice(0, 10)}T00:00:00`, timeZone) : null;
    const contexts = await sql<{ id: string; title: string }[]>`
      select id,title from public.work_contexts where user_id=${userId} and kind='course' and status='active' order by title`;
    const normalized = text.toLowerCase().replace(/\s+/g, "");
    const context = contexts.find((item) => normalized.includes(item.title.toLowerCase().replace(/\s+/g, "")))
      ?? (/(^|[^a-z])db([^a-z]|$)/i.test(text) || /데이터베이스/.test(text)
        ? contexts.find((item) => /database|데이터베이스/i.test(item.title)) : undefined);
    const excludeVideo = /(영상|강의).*(제외|안\s*듣|듣지\s*않)|교안.*(직접|공부)/.test(text);
    const directMaterialStudy = /교안.*(직접|공부)|직접.*교안/.test(text);
    if (scope === "PERSISTENT" && (excludeVideo || directMaterialStudy) && !context) {
      return { status: "error", message: "계속 반영할 학습 전략은 과목 이름을 함께 적어 주세요." };
    }
    const tasks = await sql<{ id: string; title: string }[]>`
      select id,title from public.tasks where user_id=${userId} and status<>'DONE' order by created_at`;
    const namedTaskIds = tasks.filter((task) => normalized.includes(task.title.toLowerCase().replace(/\s+/g, ""))).map((task) => task.id);
    const dueToday = /과제.*(먼저|우선|무조건)|(먼저|우선|무조건).*과제/.test(text)
      ? await sql<{ id: string }[]>`select id from public.tasks where user_id=${userId} and status<>'DONE'
          and official_deadline is not null and (official_deadline at time zone ${timeZone})::date=${date}::date order by official_deadline`
      : [];
    const priorityTaskIds = [...new Set([...namedTaskIds, ...dueToday.map((task) => task.id)])];
    const priorityOrder = {
      kind: "chief_status_override", scope, priorityTaskIds,
      workContextId: context?.id ?? null, excludeVideo, directMaterialStudy
    };
    await sql`insert into public.strategic_directives(
        user_id,directive,priority_order,scope_id,reason,origin,created_by,confirmation_status,source_reference,valid_from,valid_until
      ) select ${userId},${text},${sql.json(priorityOrder)},null,'Chief Status 사용자 수정','user','user','confirmed',
        ${sql.json({ source: "home_current_status", scope })},${now},${validUntil}
      where not exists(select 1 from public.strategic_directives where user_id=${userId} and directive=${text}
        and priority_order=${sql.json(priorityOrder)} and (valid_until is null or valid_until>${now}))`;
    revalidatePath("/");
    return { status: "success", message: scope === "TODAY" ? "오늘 상태에 반영했습니다." : "이후 계획에도 반영할 전략으로 저장했습니다." };
  } catch (error) {
    return runtimeError(error, "상태 수정 저장에 실패했습니다.");
  }
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
    const result = occurrenceId ? { kind: "routine" as const, ...(await completeManualRoutine(sql, getWebUserId(), occurrenceId)) }
      : await completeManualQuest(sql, getWebUserId(), taskId as TaskId, stepId || undefined);
    if (result.kind !== "step" && !result.duplicate) {
      await createWebReplanService(sql).processLatestTrigger(getWebUserId(), await profileTimeZone(), new Date());
    }
    revalidatePath("/");
    revalidatePath("/work");
    const officialPending = "officialSubmission" in result && result.officialSubmission.state === "pending_confirmation";
    return {
      status: "success",
      message: result.duplicate ? "이미 완료된 Quest입니다. 현재 상태를 다시 확인했습니다."
        : result.kind === "step" ? "Step을 완료했습니다. 다음 Step을 확인했습니다."
          : officialPending ? "완료로 반영했습니다. 공식 제출 상태는 연동 원본에서 별도로 확인합니다."
            : "Quest를 완료하고 남은 계획을 확인했습니다."
    };
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
