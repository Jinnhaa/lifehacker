import { createHash } from "node:crypto";
import { google, type calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  CalendarSyncTokenExpiredError,
  normalizedCalendarEventSchema,
  type CalendarPage,
  type CalendarPageRequest,
  type GoogleCalendarClient,
  type NormalizedCalendarEvent
} from "./contracts.js";
import { parseGoogleDateTime, zonedDateTimeToUtc } from "./date-time.js";

export interface GoogleCalendarAdapterOptions {
  readonly auth: OAuth2Client;
  readonly userTimeZone: string;
}

export class GoogleCalendarAdapter implements GoogleCalendarClient {
  private readonly calendar: calendar_v3.Calendar;

  constructor(private readonly options: GoogleCalendarAdapterOptions) {
    this.calendar = google.calendar({ version: "v3", auth: options.auth });
  }

  async listEvents(request: CalendarPageRequest): Promise<CalendarPage> {
    try {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: request.calendarId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 2500
      };
      if (request.pageToken) params.pageToken = request.pageToken;
      if (request.syncToken) params.syncToken = request.syncToken;
      else {
        if (request.timeMin) params.timeMin = request.timeMin;
        if (request.timeMax) params.timeMax = request.timeMax;
      }
      const response = await this.calendar.events.list(params);
      const calendarTimeZone = response.data.timeZone ?? this.options.userTimeZone;
      return {
        events: (response.data.items ?? []).map((event) => normalizeGoogleCalendarEvent(event, request.calendarId, calendarTimeZone, this.options.userTimeZone)),
        ...(response.data.nextPageToken && { nextPageToken: response.data.nextPageToken }),
        ...(response.data.nextSyncToken && { nextSyncToken: response.data.nextSyncToken })
      };
    } catch (error) {
      if (isGone(error)) throw new CalendarSyncTokenExpiredError();
      throw error;
    }
  }
}

export function normalizeGoogleCalendarEvent(
  event: calendar_v3.Schema$Event,
  calendarId: string,
  calendarTimeZone: string,
  userTimeZone: string
): NormalizedCalendarEvent {
  if (!event.id) throw new Error("Google Calendar event lacks an id");
  const status = event.status === "cancelled" ? "cancelled" : event.status === "tentative" ? "tentative" : "confirmed";
  const zone = event.start?.timeZone || event.end?.timeZone || calendarTimeZone || userTimeZone;
  const allDay = Boolean(event.start?.date || event.end?.date);
  const fallback = event.originalStartTime?.dateTime
    ? parseGoogleDateTime(event.originalStartTime.dateTime, event.originalStartTime.timeZone ?? zone)
    : event.originalStartTime?.date
      ? zonedDateTimeToUtc(event.originalStartTime.date, zone)
      : new Date(0);
  const start = event.start?.dateTime
    ? parseGoogleDateTime(event.start.dateTime, zone)
    : event.start?.date ? zonedDateTimeToUtc(event.start.date, zone) : fallback;
  const end = event.end?.dateTime
    ? parseGoogleDateTime(event.end.dateTime, zone)
    : event.end?.date ? zonedDateTimeToUtc(event.end.date, zone) : start;
  const canonical = {
    source: "google_calendar",
    ownership: "external",
    calendarId,
    externalEventId: event.id,
    externalVersion: event.updated ?? event.etag ?? `${status}:${start.toISOString()}`,
    title: event.summary ?? "",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    timeZone: zone,
    recurringEventId: event.recurringEventId ?? null,
    originalStart: event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? null,
    status,
    transparency: event.transparency === "transparent" ? "transparent" : "opaque",
    visibility: event.visibility ?? null
  };
  return normalizedCalendarEventSchema.parse({
    ...canonical,
    contentHash: createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
  });
}

function isGone(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; response?: { status?: unknown } };
  return value.code === 410 || value.response?.status === 410;
}
