"use server";

import { PeriodGoalManagementService, SupabasePeriodGoalManagementRepository } from "@amber/core";
import { revalidatePath } from "next/cache";
import type { WorkActionState } from "../../lib/work-types";
import { getWebSql, getWebUserId } from "../../lib/web-runtime";

export async function savePeriodGoalAction(_state: WorkActionState, form: FormData): Promise<WorkActionState> {
  const optional = (key: string): string | null => String(form.get(key) ?? "").trim() || null;
  const number = (key: string): number | null => optional(key) === null ? null : Number(optional(key));
  try {
    const service = new PeriodGoalManagementService(new SupabasePeriodGoalManagementRepository(getWebSql()));
    const userId = getWebUserId();
    const id = optional("id");
    const intent = optional("intent");
    if (intent === "archiveGoal" && id) await service.archiveGoal(userId, id);
    else if (intent === "cancelObjective" && id) await service.cancelObjective(userId, id);
    else if (intent === "saveGoal") await service.saveGoal(userId, id, {
      title: optional("title"), level: optional("level"), periodStart: optional("periodStart"), periodEnd: optional("periodEnd"), parentGoalId: optional("parentGoalId")
    });
    else if (intent === "saveObjective") await service.saveObjective(userId, id, {
      title: optional("title"), goalId: optional("goalId"), progressMode: optional("progressMode"), status: optional("status") ?? "active",
      successCriteria: optional("successCriteria"), targetDate: optional("targetDate"), targetValue: number("targetValue"), currentValue: number("currentValue"), unit: optional("unit")
    });
    else throw new Error("저장 요청을 확인해 주세요.");
    revalidatePath("/work");
    return { status: "success", message: "목표 변경을 저장했습니다." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "목표 저장에 실패했습니다." };
  }
}
