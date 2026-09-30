import { describe, expect, it } from "vitest";
import { LOCAL_SUPABASE_DATABASE_URL, loadDiscordWorkerConfig } from "./config.js";

describe("Discord worker config", () => {
  it("loads secrets from environment without embedding defaults", () => {
    expect(loadDiscordWorkerConfig({
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_ALLOWED_USER_ID: "123456789012345678"
    })).toEqual({
      botToken: "test-token",
      allowedDiscordUserId: "123456789012345678",
      databaseUrl: LOCAL_SUPABASE_DATABASE_URL,
      wakePollIntervalMs: 30_000,
      calendarUserId: null,
      workDiscoverySyncIntervalMs: 900_000
    });
  });

  it("accepts the configured user for Notion work discovery", () => {
    const config = loadDiscordWorkerConfig({
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_ALLOWED_USER_ID: "123456789012345678",
      AMBER_USER_ID: "11111111-1111-4111-8111-111111111111"
    });
    expect(config.calendarUserId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("accepts a bounded wake polling interval", () => {
    expect(loadDiscordWorkerConfig({
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_ALLOWED_USER_ID: "123456789012345678",
      WAKE_POLL_INTERVAL_MS: "5000"
    }).wakePollIntervalMs).toBe(5_000);
  });

  it("requires both the bot token and a Discord snowflake allowlist", () => {
    expect(() => loadDiscordWorkerConfig({ DISCORD_ALLOWED_USER_ID: "123456789012345678" })).toThrow();
    expect(() => loadDiscordWorkerConfig({ DISCORD_BOT_TOKEN: "test-token", DISCORD_ALLOWED_USER_ID: "not-an-id" })).toThrow();
  });
});
