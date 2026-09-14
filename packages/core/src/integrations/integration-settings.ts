export type IntegrationDomain = "calendar" | "work";

export type IntegrationProvider = "icloud_calendar" | "google_calendar" | "notion" | "snowboard";

export type IntegrationState = "connected" | "disconnected" | "needs_config" | "error" | "unavailable";

export interface IntegrationAccount {
  readonly id: string;
  readonly userId: string;
  readonly provider: string;
  readonly externalAccountId: string | null;
  readonly status: string;
  readonly secretRef: string | null;
  readonly metadata: Record<string, unknown>;
  readonly connectedAt: Date | null;
  readonly lastSyncAt: Date | null;
  readonly createdAt: Date;
}

export interface IntegrationSummary {
  readonly provider: IntegrationProvider;
  readonly name: string;
  readonly domain: IntegrationDomain;
  readonly state: IntegrationState;
  readonly accountId: string | null;
  readonly lastSyncAt: Date | null;
  readonly canActivate: boolean;
  readonly canDeactivate: boolean;
  readonly setupHint: string | null;
}

const catalog: readonly {
  readonly provider: IntegrationProvider;
  readonly name: string;
  readonly domain: IntegrationDomain;
  readonly available: boolean;
  readonly setupHint: string | null;
}[] = [
  { provider: "icloud_calendar", name: "iCloud", domain: "calendar", available: true, setupHint: "기존 iCloud Calendar CLI로 계정을 먼저 연결해 주세요." },
  { provider: "google_calendar", name: "Google Calendar", domain: "calendar", available: true, setupHint: "기존 Google Calendar 인증 CLI로 계정을 먼저 연결해 주세요." },
  { provider: "notion", name: "Notion", domain: "work", available: true, setupHint: "Notion 연결과 source 설정이 필요합니다." },
  { provider: "snowboard", name: "Snowboard", domain: "work", available: false, setupHint: "아직 지원하지 않는 provider입니다." }
];

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export const isIntegrationAccountConfigured = (account: IntegrationAccount): boolean => {
  if (!nonEmpty(account.secretRef)) return false;
  if (account.provider === "icloud_calendar") {
    return nonEmpty(account.externalAccountId) && nonEmpty(account.metadata.caldavBaseUrl);
  }
  if (account.provider === "google_calendar") {
    const calendar = account.metadata.calendar;
    return nonEmpty(account.externalAccountId) && typeof calendar === "object" && calendar !== null
      && nonEmpty((calendar as Record<string, unknown>).calendarId);
  }
  if (account.provider === "notion") {
    return Array.isArray(account.metadata.sourceIds)
      && account.metadata.sourceIds.length > 0
      && account.metadata.sourceIds.every(nonEmpty);
  }
  return false;
};

export const deriveIntegrationSummaries = (
  accounts: readonly IntegrationAccount[]
): readonly IntegrationSummary[] => catalog.map((entry) => {
  if (!entry.available) return {
    ...entry, state: "unavailable" as const, accountId: null, lastSyncAt: null,
    canActivate: false, canDeactivate: false
  };

  const candidates = accounts
    .filter((account) => account.provider === entry.provider)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const active = candidates.filter((account) => account.status === "active");
  const selected = active[0] ?? candidates[0] ?? null;
  if (!selected) return {
    ...entry, state: "needs_config" as const, accountId: null, lastSyncAt: null,
    canActivate: false, canDeactivate: false
  };

  const configured = isIntegrationAccountConfigured(selected);
  const state: IntegrationState = active.length > 1 || selected.status === "error" || (selected.status === "active" && !configured)
    ? "error"
    : selected.status === "active"
      ? "connected"
      : configured
        ? "disconnected"
        : "needs_config";
  return {
    ...entry,
    state,
    accountId: selected.id,
    lastSyncAt: selected.lastSyncAt,
    canActivate: selected.status !== "active" && configured,
    canDeactivate: selected.status === "active"
  };
});
