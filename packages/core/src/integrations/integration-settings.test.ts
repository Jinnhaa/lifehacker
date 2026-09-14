import { describe, expect, it } from "vitest";
import { deriveIntegrationSummaries, type IntegrationAccount } from "./integration-settings.js";

const account = (overrides: Partial<IntegrationAccount> = {}): IntegrationAccount => ({
  id: "10000000-0000-4000-8000-000000000001",
  userId: "20000000-0000-4000-8000-000000000001",
  provider: "icloud_calendar",
  externalAccountId: "calendar@example.test",
  status: "active",
  secretRef: "env:TEST_SECRET",
  metadata: { caldavBaseUrl: "https://calendar.example.test" },
  connectedAt: new Date("2026-09-01T00:00:00.000Z"),
  lastSyncAt: new Date("2026-09-13T00:00:00.000Z"),
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  ...overrides
});

describe("deriveIntegrationSummaries", () => {
  it("canonical account state와 설정 완성도에서 provider 상태를 파생한다", () => {
    const result = deriveIntegrationSummaries([
      account(),
      account({
        id: "10000000-0000-4000-8000-000000000002", provider: "notion", status: "disabled",
        externalAccountId: null, metadata: { sourceIds: ["source-1"] }
      }),
      account({
        id: "10000000-0000-4000-8000-000000000003", provider: "google_calendar", status: "disabled",
        metadata: {}, secretRef: null
      })
    ]);
    expect(result.map(({ provider, state, canActivate, canDeactivate }) => ({ provider, state, canActivate, canDeactivate }))).toEqual([
      { provider: "icloud_calendar", state: "connected", canActivate: false, canDeactivate: true },
      { provider: "google_calendar", state: "needs_config", canActivate: false, canDeactivate: false },
      { provider: "notion", state: "disconnected", canActivate: true, canDeactivate: false },
      { provider: "snowboard", state: "unavailable", canActivate: false, canDeactivate: false }
    ]);
  });

  it("동일 provider의 active account가 둘이면 오류로 표시한다", () => {
    const result = deriveIntegrationSummaries([
      account(),
      account({ id: "10000000-0000-4000-8000-000000000004", createdAt: new Date("2026-09-02T00:00:00.000Z") })
    ]);
    expect(result.find((item) => item.provider === "icloud_calendar")?.state).toBe("error");
  });
});

