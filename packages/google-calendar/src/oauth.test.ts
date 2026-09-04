import { describe, expect, it } from "vitest";
import { GOOGLE_CALENDAR_READONLY_SCOPE } from "./contracts.js";
import { createGoogleOAuthClient, createReadOnlyAuthorizationUrl } from "./oauth.js";

describe("Google Calendar OAuth", () => {
  it("requests offline access with only the read-only Calendar scope", () => {
    const url = new URL(createReadOnlyAuthorizationUrl(createGoogleOAuthClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/oauth/google-calendar"
    })));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_READONLY_SCOPE);
  });
});
