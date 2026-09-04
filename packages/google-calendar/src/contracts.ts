import { z } from "zod";

export const GOOGLE_CALENDAR_SOURCE = "google_calendar";
export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export const normalizedCalendarEventSchema = z.object({
  calendarId: z.string().min(1),
  externalEventId: z.string().min(1),
  externalVersion: z.string().min(1),
  title: z.string(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  allDay: z.boolean(),
  timeZone: z.string().min(1),
  recurringEventId: z.string().min(1).nullable(),
  originalStart: z.string().min(1).nullable(),
  status: z.enum(["confirmed", "tentative", "cancelled"]),
  transparency: z.enum(["opaque", "transparent"]),
  visibility: z.string().nullable(),
  contentHash: z.string().length(64)
}).strict();

export type NormalizedCalendarEvent = z.infer<typeof normalizedCalendarEventSchema>;

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

export interface CalendarSyncWindow {
  readonly start: Date;
  readonly end: Date;
}

export interface CalendarSyncResult {
  readonly mode: "full" | "incremental" | "full_after_token_expiry";
  readonly received: number;
  readonly active: number;
  readonly deleted: number;
  readonly nextSyncToken: string;
}
