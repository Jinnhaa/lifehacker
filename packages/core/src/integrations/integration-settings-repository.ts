import type { IntegrationAccount } from "./integration-settings.js";

export interface IntegrationSettingsRepository {
  listAccounts(userId: string): Promise<readonly IntegrationAccount[]>;
  setAccountEnabled(input: {
    readonly userId: string;
    readonly accountId: string;
    readonly enabled: boolean;
    readonly changedAt: Date;
  }): Promise<boolean>;
}

