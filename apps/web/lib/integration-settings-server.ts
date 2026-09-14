import "server-only";

import { IntegrationSettingsService, SupabaseIntegrationSettingsRepository } from "@amber/core";
import type { Sql } from "postgres";
import { getWebSql, getWebUserId } from "./web-runtime";
import type { IntegrationSettingsViewModel } from "./integration-settings-types";

export const createWebIntegrationSettingsService = (sql: Sql) => new IntegrationSettingsService(
  new SupabaseIntegrationSettingsRepository(sql)
);

const formatLastSync = (value: Date | null): string | null => value
  ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(value)
  : null;

export const loadIntegrationSettings = async (): Promise<IntegrationSettingsViewModel> => {
  try {
    const items = await createWebIntegrationSettingsService(getWebSql()).list(getWebUserId());
    return {
      configured: true,
      error: null,
      items: items.map((item) => ({ ...item, lastSyncLabel: formatLastSync(item.lastSyncAt) }))
    };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : "Integration 설정을 불러오지 못했습니다.",
      items: []
    };
  }
};

