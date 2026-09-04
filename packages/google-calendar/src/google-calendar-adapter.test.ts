import { describe, expect, it } from "vitest";
import { normalizeGoogleCalendarEvent } from "./google-calendar-adapter.js";

describe("Google Calendar normalization", () => {
  it("normalizes an all-day event with exclusive end in the calendar timezone", () => {
    const result = normalizeGoogleCalendarEvent({
      id: "all-day", summary: "휴일", status: "confirmed", updated: "2026-09-01T00:00:00Z",
      start: { date: "2026-09-04" }, end: { date: "2026-09-05" }
    }, "primary", "Asia/Seoul", "UTC");
    expect(result).toMatchObject({ allDay: true, timeZone: "Asia/Seoul", start: "2026-09-03T15:00:00.000Z", end: "2026-09-04T15:00:00.000Z" });
  });

  it("preserves an explicit timed offset and recurring occurrence identity", () => {
    const result = normalizeGoogleCalendarEvent({
      id: "instance", recurringEventId: "series", status: "confirmed", updated: "2026-09-01T00:00:00Z",
      originalStartTime: { dateTime: "2026-09-04T10:00:00+09:00", timeZone: "Asia/Seoul" },
      start: { dateTime: "2026-09-04T10:30:00+09:00", timeZone: "Asia/Seoul" },
      end: { dateTime: "2026-09-04T11:30:00+09:00", timeZone: "Asia/Seoul" }
    }, "primary", "UTC", "UTC");
    expect(result).toMatchObject({ start: "2026-09-04T01:30:00.000Z", recurringEventId: "series", originalStart: "2026-09-04T10:00:00+09:00" });
  });

  it("uses the calendar timezone for a local timestamp and respects DST", () => {
    const result = normalizeGoogleCalendarEvent({
      id: "dst", status: "confirmed", updated: "2026-03-01T00:00:00Z",
      start: { dateTime: "2026-03-09T09:00:00" }, end: { dateTime: "2026-03-09T10:00:00" }
    }, "primary", "America/New_York", "Asia/Seoul");
    expect(result).toMatchObject({ timeZone: "America/New_York", start: "2026-03-09T13:00:00.000Z", end: "2026-03-09T14:00:00.000Z" });
  });

  it("falls back to the user timezone when provider timezone is absent", () => {
    const result = normalizeGoogleCalendarEvent({
      id: "fallback", status: "confirmed", etag: "v1",
      start: { dateTime: "2026-09-04T09:00:00" }, end: { dateTime: "2026-09-04T10:00:00" }
    }, "primary", "", "Asia/Seoul");
    expect(result.timeZone).toBe("Asia/Seoul");
    expect(result.start).toBe("2026-09-04T00:00:00.000Z");
  });
});
