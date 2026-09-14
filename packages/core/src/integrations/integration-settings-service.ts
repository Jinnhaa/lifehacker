import { DomainError, userIdSchema } from "@amber/shared";
import { z } from "zod";
import { deriveIntegrationSummaries, isIntegrationAccountConfigured, type IntegrationSummary } from "./integration-settings.js";
import type { IntegrationSettingsRepository } from "./integration-settings-repository.js";

const changeSchema = z.object({
  userId: userIdSchema,
  accountId: z.uuid(),
  enabled: z.boolean()
});

export class IntegrationSettingsService {
  constructor(private readonly repository: IntegrationSettingsRepository) {}

  async list(userId: string): Promise<readonly IntegrationSummary[]> {
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) throw new DomainError("INVALID_INPUT", "Integration user is invalid");
    return deriveIntegrationSummaries(await this.repository.listAccounts(parsedUserId.data));
  }

  async setEnabled(input: { readonly userId: string; readonly accountId: string; readonly enabled: boolean }): Promise<readonly IntegrationSummary[]> {
    const parsed = changeSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("INVALID_INPUT", "Integration change is invalid", { issues: parsed.error.issues });
    const accounts = await this.repository.listAccounts(parsed.data.userId);
    const account = accounts.find((candidate) => candidate.id === parsed.data.accountId);
    if (!account) throw new DomainError("INVALID_INPUT", "Integration account was not found");
    if (!(["icloud_calendar", "google_calendar", "notion"] as const).includes(account.provider as "icloud_calendar" | "google_calendar" | "notion")) {
      throw new DomainError("INVALID_INPUT", "Integration provider cannot be managed here");
    }
    if (parsed.data.enabled && !isIntegrationAccountConfigured(account)) {
      throw new DomainError("CONFLICT", "Integration configuration is incomplete");
    }
    const updated = await this.repository.setAccountEnabled({ ...parsed.data, changedAt: new Date() });
    if (!updated) throw new DomainError("CONFLICT", "Integration account changed before the request completed");
    return this.list(parsed.data.userId);
  }
}
