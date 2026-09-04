import { z } from "zod";

export const normalizedCalendarEventSchema = z.object({
  source: z.string().min(1),
  ownership: z.literal("external"),
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

export interface CalendarSyncWindow {
  readonly start: Date;
  readonly end: Date;
}
