"use server";

import type { CommitmentLevel, ContextCommonInput, ProjectType } from "@amber/core";
import { revalidatePath } from "next/cache";
import { createWebContextManagementService } from "../../lib/context-management-server";
import type { ContextActionState } from "../../lib/context-management-types";
import { getWebSql, getWebUserId } from "../../lib/web-runtime";

const optional = (formData: FormData, key: string): string | null => String(formData.get(key) ?? "").trim() || null;
const common = (formData: FormData): ContextCommonInput => {
  const importance = optional(formData, "strategicImportance");
  return {
    title: String(formData.get("title") ?? "").trim(), description: optional(formData, "description"),
    strategicImportance: importance === null ? null : Number(importance),
    commitmentLevel: optional(formData, "commitmentLevel") as CommitmentLevel | null,
    startDate: optional(formData, "startDate"), endDate: optional(formData, "endDate"),
    internalStartDate: optional(formData, "internalStartDate")
  };
};
const result = (status: ContextActionState["status"], message: string): ContextActionState => ({ status, message });
const refresh = (): void => { revalidatePath("/projects"); revalidatePath("/work"); revalidatePath("/"); };

export const saveProjectContextAction = async (_state: ContextActionState, formData: FormData): Promise<ContextActionState> => {
  try {
    const intent = formData.get("intent");
    const contextId = optional(formData, "contextId");
    const service = createWebContextManagementService(getWebSql());
    const userId = getWebUserId();
    if (intent === "archive") {
      if (!contextId) throw new Error("보관할 Project를 찾지 못했습니다.");
      await service.archive(userId, contextId, "project");
      refresh();
      return result("success", "Project를 보관했습니다.");
    }
    if (intent !== "create" && intent !== "update") throw new Error("저장 요청을 확인해 주세요.");
    const cadence = optional(formData, "reviewCadenceDays");
    const strategy = {
      projectType: optional(formData, "projectType") as ProjectType | null,
      reviewCadenceDays: cadence === null ? null : Number(cadence),
      displaceable: formData.get("displaceable") === "on"
    };
    if (intent === "create") await service.createProject(userId, common(formData), strategy);
    else {
      if (!contextId) throw new Error("수정할 Project를 찾지 못했습니다.");
      await service.updateProject(userId, contextId, common(formData), strategy);
    }
    refresh();
    return result("success", intent === "create" ? "새 Project를 만들었습니다." : "Project를 수정했습니다.");
  } catch (error) {
    return result("error", error instanceof Error ? error.message : "Project 저장에 실패했습니다.");
  }
};
