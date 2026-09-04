import type { CalendarIntegrationAccount, CalendarSyncWindow, NormalizedCalendarEvent } from "./contracts.js";

export interface ApplyCalendarSyncInput {
  readonly account: CalendarIntegrationAccount;
  readonly events: readonly NormalizedCalendarEvent[];
  readonly nextSyncToken: string;
  readonly fullSync: boolean;
  readonly window: CalendarSyncWindow;
  readonly synchronizedAt: Date;
}

export interface ApplyCalendarSyncResult {
  readonly active: number;
  readonly deleted: number;
}

export interface FixedTimeConstraint {
  readonly id: string;
  readonly externalEventId: string;
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  readonly timeZone: string;
  readonly blocksCapacity: boolean;
  readonly ownership: "external" | "amber_managed";
}

export interface CalendarSyncRepository {
  getActiveAccount(userId: string): Promise<CalendarIntegrationAccount | null>;
  applySync(input: ApplyCalendarSyncInput): Promise<ApplyCalendarSyncResult>;
  listFixedTimeConstraints(userId: string, start: Date, end: Date): Promise<readonly FixedTimeConstraint[]>;
}
