import { describe, expect, it } from "vitest";
import { normalizeICloudCalendarObject } from "./ical-normalizer.js";

const collection = {
  id: "https://caldav.test/calendar/one/",
  name: "개인",
  ctag: "ctag-1",
  syncToken: "sync-1",
  timeZone: "Asia/Seoul"
};
const window = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-09-30T00:00:00Z") };

function normalize(data: string) {
  return normalizeICloudCalendarObject({ data, etag: '"etag-1"', objectUrl: "event.ics", collection, window, userTimeZone: "Asia/Seoul" });
}

describe("iCloud iCalendar normalization", () => {
  it("preserves an all-day event with an exclusive end in Asia/Seoul", () => {
    const [event] = normalize(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:all-day\r\nDTSTART;VALUE=DATE:20260904\r\nDTEND;VALUE=DATE:20260905\r\nSUMMARY:하루 일정\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`);
    expect(event).toMatchObject({
      allDay: true,
      timeZone: "Asia/Seoul",
      start: "2026-09-03T15:00:00.000Z",
      end: "2026-09-04T15:00:00.000Z"
    });
  });

  it("expands recurring events within the bounded window and gives every occurrence a stable identity", () => {
    const events = normalize(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:weekly-class\r\nDTSTART;TZID=Asia/Seoul:20260904T100000\r\nDTEND;TZID=Asia/Seoul:20260904T110000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:주간 수업\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`);
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.start)).toEqual([
      "2026-09-04T01:00:00.000Z",
      "2026-09-11T01:00:00.000Z",
      "2026-09-18T01:00:00.000Z"
    ]);
    expect(new Set(events.map((event) => event.externalEventId)).size).toBe(3);
    expect(events.every((event) => event.recurringEventId === "weekly-class")).toBe(true);
  });

  it("uses UTC timestamps directly and maps transparent/tentative status", () => {
    const [event] = normalize(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:utc-event\r\nDTSTART:20260904T010000Z\r\nDTEND:20260904T020000Z\r\nSTATUS:TENTATIVE\r\nTRANSP:TRANSPARENT\r\nSUMMARY:UTC 일정\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`);
    expect(event).toMatchObject({
      start: "2026-09-04T01:00:00.000Z",
      end: "2026-09-04T02:00:00.000Z",
      status: "tentative",
      transparency: "transparent"
    });
  });
});
