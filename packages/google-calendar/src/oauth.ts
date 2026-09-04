import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { GOOGLE_CALENDAR_READONLY_SCOPE } from "./contracts.js";

export function createGoogleOAuthClient(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuth2Client {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export function createReadOnlyAuthorizationUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GOOGLE_CALENDAR_READONLY_SCOPE]
  });
}
