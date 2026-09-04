import type { NormalizedCalendarEvent } from "@amber/shared";

export { normalizedCalendarEventSchema } from "@amber/shared";
export type { CalendarSyncWindow, NormalizedCalendarEvent } from "@amber/shared";

export const GOOGLE_CALENDAR_SOURCE = "google_calendar";
export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export interface CalendarPageRequest {
  readonly calendarId: string;
  readonly pageToken?: string;
  readonly syncToken?: string;
  readonly timeMin?: string;
  readonly timeMax?: string;
}

export interface CalendarPage {
  readonly events: readonly NormalizedCalendarEvent[];
  readonly nextPageToken?: string;
  readonly nextSyncToken?: string;
}

export interface GoogleCalendarClient {
  listEvents(request: CalendarPageRequest): Promise<CalendarPage>;
}

export class CalendarSyncTokenExpiredError extends Error {
  constructor() {
    super("Google Calendar sync token expired");
    this.name = "CalendarSyncTokenExpiredError";
  }
}

export interface CalendarIntegrationAccount {
  readonly id: string;
  readonly userId: string;
  readonly calendarId: string;
  readonly secretRef: string;
  readonly syncToken: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CalendarSyncResult {
  readonly mode: "full" | "incremental" | "full_after_token_expiry";
  readonly received: number;
  readonly active: number;
  readonly deleted: number;
  readonly nextSyncToken: string;
}
