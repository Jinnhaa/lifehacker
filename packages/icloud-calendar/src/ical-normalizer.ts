import { createHash } from "node:crypto";
import { normalizedCalendarEventSchema, zonedDateTimeToUtc, type CalendarSyncWindow, type NormalizedCalendarEvent } from "@amber/shared";
import ICAL from "ical.js";
import type { ICloudCalendarCollection } from "./contracts.js";

export interface ICloudCalendarObjectInput {
  readonly data: string;
  readonly etag: string | null;
  readonly objectUrl: string;
  readonly collection: ICloudCalendarCollection;
  readonly window: CalendarSyncWindow;
  readonly userTimeZone: string;
}

export function normalizeICloudCalendarObject(input: ICloudCalendarObjectInput): NormalizedCalendarEvent[] {
  const calendar = new ICAL.Component(ICAL.parse(input.data));
  for (const component of calendar.getAllSubcomponents("vtimezone")) {
    const id = component.getFirstPropertyValue("tzid");
    if (typeof id === "string") ICAL.TimezoneService.register(component, id);
  }
  const components = calendar.getAllSubcomponents("vevent");
  const exceptions = components.filter((component) => new ICAL.Event(component).isRecurrenceException());
  const masters = components.filter((component) => !new ICAL.Event(component).isRecurrenceException());
  const result: NormalizedCalendarEvent[] = [];

  for (const component of masters) {
    const related = exceptions.filter((candidate) => new ICAL.Event(candidate).uid === new ICAL.Event(component).uid);
    const event = new ICAL.Event(component, { exceptions: related });
    if (event.isRecurring()) {
      const iterator = event.iterator();
      for (let count = 0, occurrence = iterator.next(); occurrence && count < 10_000; occurrence = iterator.next(), count += 1) {
        const details = event.getOccurrenceDetails(occurrence);
        const normalized = normalizeOccurrence(input, details.item, details.startDate, details.endDate, details.recurrenceId);
        if (normalized.end > input.window.start && normalized.start < input.window.end) result.push(normalized.event);
        if (normalized.start >= input.window.end) break;
      }
    } else {
      const normalized = normalizeOccurrence(input, event, event.startDate, event.endDate, null);
      if (normalized.end > input.window.start && normalized.start < input.window.end) result.push(normalized.event);
    }
  }

  for (const component of exceptions) {
    const exception = new ICAL.Event(component);
    if (masters.some((master) => new ICAL.Event(master).uid === exception.uid)) continue;
    const normalized = normalizeOccurrence(input, exception, exception.startDate, exception.endDate, exception.recurrenceId);
    if (normalized.end > input.window.start && normalized.start < input.window.end) result.push(normalized.event);
  }
  return result;
}

function normalizeOccurrence(
  input: ICloudCalendarObjectInput,
  event: InstanceType<typeof ICAL.Event>,
  startTime: InstanceType<typeof ICAL.Time>,
  endTime: InstanceType<typeof ICAL.Time>,
  recurrenceId: InstanceType<typeof ICAL.Time> | null
): { event: NormalizedCalendarEvent; start: Date; end: Date } {
  const component = event.component;
  const timeZone = propertyTimeZone(component, "dtstart") ?? input.collection.timeZone ?? input.userTimeZone;
  const start = icalTimeToDate(startTime, timeZone);
  const end = icalTimeToDate(endTime, timeZone);
  const recurrenceIdentity = recurrenceId ? recurrenceId.toString() : null;
  const externalEventId = recurrenceIdentity ? `${event.uid}::${recurrenceIdentity}` : event.uid || input.objectUrl;
  const statusValue = stringProperty(component, "status").toUpperCase();
  const status = statusValue === "CANCELLED" ? "cancelled" : statusValue === "TENTATIVE" ? "tentative" : "confirmed";
  const canonical = {
    source: "icloud_calendar",
    ownership: "external",
    calendarId: input.collection.id,
    externalEventId,
    externalVersion: input.etag ?? `${event.sequence}:${stringProperty(component, "last-modified") || stringProperty(component, "dtstamp") || start.toISOString()}`,
    title: event.summary ?? "",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: startTime.isDate,
    timeZone,
    recurringEventId: recurrenceIdentity ? event.uid : null,
    originalStart: recurrenceIdentity,
    status,
    transparency: stringProperty(component, "transp").toUpperCase() === "TRANSPARENT" ? "transparent" : "opaque",
    visibility: stringProperty(component, "class") || null
  } as const;
  return {
    start,
    end,
    event: normalizedCalendarEventSchema.parse({
      ...canonical,
      contentHash: createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
    })
  };
}

function propertyTimeZone(component: InstanceType<typeof ICAL.Component>, propertyName: string): string | null {
  const property = component.getFirstProperty(propertyName);
  const parameter = property?.getParameter("tzid");
  return typeof parameter === "string" && parameter.length > 0 ? parameter : null;
}

function stringProperty(component: InstanceType<typeof ICAL.Component>, propertyName: string): string {
  const value = component.getFirstPropertyValue(propertyName);
  return typeof value === "string" ? value : value?.toString() ?? "";
}

function icalTimeToDate(value: InstanceType<typeof ICAL.Time>, timeZone: string): Date {
  if (value.zone.tzid === "UTC" || value.zone.tzid === "Z") return value.toJSDate();
  if (value.zone.tzid !== "floating" && ICAL.TimezoneService.has(value.zone.tzid)) return value.toJSDate();
  const local = `${pad(value.year, 4)}-${pad(value.month, 2)}-${pad(value.day, 2)}T${pad(value.hour, 2)}:${pad(value.minute, 2)}:${pad(value.second, 2)}`;
  return zonedDateTimeToUtc(local, timeZone);
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}
