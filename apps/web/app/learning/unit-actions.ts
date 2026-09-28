"use server";

import { revalidatePath } from "next/cache";
import { createWebLearningUnitService } from "../../lib/context-management-server";
import type { ContextActionState } from "../../lib/context-management-types";
import { getWebSql, getWebUserId } from "../../lib/web-runtime";

export async function saveLearningUnitAction(_state: ContextActionState, form: FormData): Promise<ContextActionState> {
  try {
    const service = createWebLearningUnitService(getWebSql());
    const userId = getWebUserId();
    const contextId = String(form.get("contextId") ?? "");
    const id = String(form.get("id") ?? "");
    const intent = form.get("intent");
    if (intent === "delete") await service.delete(userId, contextId, id, form.get("confirmDelete") === "on");
    else if (intent === "create" || intent === "update") {
      const position = String(form.get("position") ?? "").trim();
      const input = {
        title: String(form.get("title") ?? "").trim(),
        ...(position ? { position: Number(position) } : {}),
        exposureState: String(form.get("exposureState") ?? "NOT_STARTED"),
        understandingState: String(form.get("understandingState") ?? "UNKNOWN"),
        validationState: String(form.get("validationState") ?? "NOT_TESTED")
      };
      if (intent === "create") await service.create(userId, contextId, input);
      else await service.update(userId, contextId, id, input);
    } else throw new Error("저장 요청을 확인해 주세요.");
    revalidatePath("/learning");
    return { status: "success", message: intent === "delete" ? "Learning Unit을 삭제했습니다." : "학습 상태를 저장했습니다." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "학습 상태 저장에 실패했습니다." };
  }
}
