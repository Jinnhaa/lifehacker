import { describe, expect, it } from "vitest";
import type { CalendarSyncWindow } from "@amber/shared";
import type { CalDavTransport } from "./icloud-caldav-adapter.js";
import { ICloudCalDavAdapter } from "./icloud-caldav-adapter.js";
import type { ICloudCalendarCollection } from "./contracts.js";

const window: CalendarSyncWindow = {
  start: new Date("2026-09-01T00:00:00Z"),
  end: new Date("2026-09-30T00:00:00Z")
};

class FakeCalDavTransport implements CalDavTransport {
  calls: string[] = [];
  readonly collections: ICloudCalendarCollection[] = [
    { id: "https://caldav.test/calendars/classes/", name: "대학교 수업", ctag: "c1", syncToken: "s1", timeZone: "Asia/Seoul" },
    { id: "https://caldav.test/calendars/work/", name: "근무", ctag: "c2", syncToken: "s2", timeZone: "Asia/Seoul" }
  ];

  async login() {
    this.calls.push("principal->calendar-home-set");
    return { principalUrl: "https://caldav.test/principal/1/", calendarHomeUrl: "https://caldav.test/calendars/1/" };
  }

  async listCalendars() {
    this.calls.push("calendar-collections");
    return this.collections;
  }

  async listCalendarObjects(collection: ICloudCalendarCollection) {
    this.calls.push(`events:${collection.id}`);
    return [{
      url: `${collection.id}event.ics`,
      etag: '"v1"',
      data: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${collection.name}\r\nDTSTART;TZID=Asia/Seoul:20260904T100000\r\nDTEND;TZID=Asia/Seoul:20260904T110000\r\nSUMMARY:${collection.name}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`
    }];
  }
}

describe("ICloudCalDavAdapter", () => {
  it("discovers principal, calendar home, and multiple calendar collections before reading events", async () => {
    const transport = new FakeCalDavTransport();
    const adapter = new ICloudCalDavAdapter({
      baseUrl: "https://caldav.test",
      appleId: "account@example.test",
      appPassword: "app-password",
      userTimeZone: "Asia/Seoul",
      transport
    });
    const discovery = await adapter.discover();
    expect(discovery).toMatchObject({
      principalUrl: "https://caldav.test/principal/1/",
      calendarHomeUrl: "https://caldav.test/calendars/1/"
    });
    expect(discovery.collections.map((calendar) => calendar.name)).toEqual(["대학교 수업", "근무"]);
    const batches = await Promise.all(discovery.collections.map((calendar) => adapter.fetchCollection(calendar, window)));
    expect(batches.flatMap((batch) => batch.events)).toHaveLength(2);
    expect(transport.calls).toEqual([
      "principal->calendar-home-set",
      "calendar-collections",
      "events:https://caldav.test/calendars/classes/",
      "events:https://caldav.test/calendars/work/"
    ]);
  });

  it("uses the standard CalDAV discovery chain and read-only HTTP methods with tsdav", async () => {
    const methods: string[] = [];
    const fakeFetch: typeof globalThis.fetch = async (request, init) => {
      const url = typeof request === "string" || request instanceof URL ? String(request) : request.url;
      const method = init?.method ?? (request instanceof Request ? request.method : "GET");
      methods.push(method);
      if (url.endsWith("/.well-known/caldav")) {
        return new Response(null, { status: 301, headers: { location: "/root/" } });
      }
      if (url.endsWith("/root/")) return xmlResponse(multistatus("/root/", "<d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal>"));
      if (url.endsWith("/principal/")) return xmlResponse(multistatus("/principal/", "<c:calendar-home-set><d:href>/calendars/</d:href></c:calendar-home-set>"));
      if (url.endsWith("/calendars/")) return xmlResponse(multistatus("/calendars/one/", "<d:displayname>개인</d:displayname><cs:getctag>ctag-1</cs:getctag><d:sync-token>sync-1</d:sync-token><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name=\"VEVENT\"/></c:supported-calendar-component-set>"));
      if (url.endsWith("/calendars/one/") && method === "PROPFIND") return xmlResponse(multistatus("/calendars/one/", "<d:supported-report-set><d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report></d:supported-report-set>"));
      if (url.endsWith("/calendars/one/") && method === "REPORT") {
        const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one\r\nDTSTART:20260904T010000Z\r\nDTEND:20260904T020000Z\r\nSUMMARY:일정\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        return xmlResponse(multistatus("/calendars/one/one.ics", `<d:getetag>&quot;v1&quot;</d:getetag><c:calendar-data><![CDATA[${ics}]]></c:calendar-data>`));
      }
      throw new Error(`Unexpected CalDAV request: ${method} ${url}`);
    };
    const adapter = new ICloudCalDavAdapter({
      baseUrl: "https://caldav.test",
      appleId: "account@example.test",
      appPassword: "app-password",
      userTimeZone: "Asia/Seoul",
      fetch: fakeFetch
    });
    const discovery = await adapter.discover();
    const batch = await adapter.fetchCollection(discovery.collections[0]!, window);
    expect(discovery).toMatchObject({ principalUrl: "https://caldav.test/principal/", calendarHomeUrl: "https://caldav.test/calendars/" });
    expect(batch.events).toHaveLength(1);
    expect(new Set(methods)).toEqual(new Set(["PROPFIND", "REPORT"]));
  });
});

function xmlResponse(body: string): Response {
  return new Response(body, { status: 207, headers: { "content-type": "application/xml; charset=utf-8" } });
}

function multistatus(href: string, properties: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"><d:response><d:href>${href}</d:href><d:propstat><d:prop>${properties}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
}
