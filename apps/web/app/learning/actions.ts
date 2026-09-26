"use server";

import type { CertificationStudyMode, CommitmentLevel, ContextCommonInput } from "@amber/core";
import { revalidatePath } from "next/cache";
import { createWebContextManagementService } from "../../lib/context-management-server";
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
