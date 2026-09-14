import type { IntegrationDomain, IntegrationProvider, IntegrationState } from "@amber/core";

export interface IntegrationSettingsItem {
  readonly provider: IntegrationProvider;
  readonly name: string;
  readonly domain: IntegrationDomain;
  readonly state: IntegrationState;
  readonly accountId: string | null;
  readonly lastSyncLabel: string | null;
  readonly canActivate: boolean;
  readonly canDeactivate: boolean;
  readonly setupHint: string | null;
}

export interface IntegrationSettingsViewModel {
  readonly configured: boolean;
  readonly error: string | null;
  readonly items: readonly IntegrationSettingsItem[];
}

export interface IntegrationActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

