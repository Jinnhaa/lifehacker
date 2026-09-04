import { z } from "zod";
export declare const normalizedCalendarEventSchema: z.ZodObject<{
    source: z.ZodString;
    ownership: z.ZodLiteral<"external">;
    calendarId: z.ZodString;
    externalEventId: z.ZodString;
    externalVersion: z.ZodString;
    title: z.ZodString;
    start: z.ZodISODateTime;
    end: z.ZodISODateTime;
    allDay: z.ZodBoolean;
    timeZone: z.ZodString;
    recurringEventId: z.ZodNullable<z.ZodString>;
    originalStart: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        confirmed: "confirmed";
        tentative: "tentative";
        cancelled: "cancelled";
    }>;
    transparency: z.ZodEnum<{
        opaque: "opaque";
        transparent: "transparent";
    }>;
    visibility: z.ZodNullable<z.ZodString>;
    contentHash: z.ZodString;
}, z.core.$strict>;
export type NormalizedCalendarEvent = z.infer<typeof normalizedCalendarEventSchema>;
export interface CalendarSyncWindow {
    readonly start: Date;
    readonly end: Date;
}
//# sourceMappingURL=calendar.d.ts.map