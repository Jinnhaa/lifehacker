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
      databaseUrl: LOCAL_SUPABASE_DATABASE_URL
    });
  });

  it("requires both the bot token and a Discord snowflake allowlist", () => {
    expect(() => loadDiscordWorkerConfig({ DISCORD_ALLOWED_USER_ID: "123456789012345678" })).toThrow();
    expect(() => loadDiscordWorkerConfig({ DISCORD_BOT_TOKEN: "test-token", DISCORD_ALLOWED_USER_ID: "not-an-id" })).toThrow();
  });
});
