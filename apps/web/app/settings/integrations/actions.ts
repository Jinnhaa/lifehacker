"use server";

import { revalidatePath } from "next/cache";
import { createWebIntegrationSettingsService } from "../../../lib/integration-settings-server";
import type { IntegrationActionState } from "../../../lib/integration-settings-types";
import { getWebSql, getWebUserId } from "../../../lib/web-runtime";

export const changeIntegrationStateAction = async (
  _previous: IntegrationActionState,
  formData: FormData
): Promise<IntegrationActionState> => {
  try {
    const intent = formData.get("intent");
    if (intent !== "activate" && intent !== "deactivate") {
      return { status: "error", message: "Integration 동작을 확인할 수 없습니다." };
    }
    await createWebIntegrationSettingsService(getWebSql()).setEnabled({
      userId: getWebUserId(),
      accountId: String(formData.get("accountId") ?? ""),
      enabled: intent === "activate"
    });
    revalidatePath("/settings/integrations");
    revalidatePath("/");
    return {
      status: "success",
      message: intent === "activate" ? "Integration을 활성화했습니다." : "Integration을 비활성화했습니다. 기존 데이터는 유지됩니다."
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Integration 상태 변경에 실패했습니다." };
  }
};

