import type { CalendarSyncWindow, NormalizedCalendarEvent } from "@amber/shared";

export const ICLOUD_CALENDAR_SOURCE = "icloud_calendar";
export const DEFAULT_ICLOUD_CALDAV_BASE_URL = "https://caldav.icloud.com";

export interface ICloudCalendarCollection {
  readonly id: string;
  readonly name: string;
  readonly ctag: string | null;
  readonly syncToken: string | null;
  readonly timeZone: string | null;
}

export interface ICloudDiscovery {
  readonly principalUrl: string;
  readonly calendarHomeUrl: string;
  readonly collections: readonly ICloudCalendarCollection[];
}

export interface ICloudCalendarAccount {
  readonly id: string;
  readonly userId: string;
  readonly externalAccountId: string;
  readonly secretRef: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ICloudCollectionSync {
  readonly collection: ICloudCalendarCollection;
  readonly events: readonly NormalizedCalendarEvent[];
}

export interface ICloudCalDavReader {
  discover(): Promise<ICloudDiscovery>;
  fetchCollection(collection: ICloudCalendarCollection, window: CalendarSyncWindow): Promise<ICloudCollectionSync>;
}

export interface ICloudSyncResult {
  readonly discoveredCalendars: number;
  readonly fetchedCalendars: number;
  readonly skippedCalendars: number;
  readonly received: number;
  readonly active: number;
  readonly deleted: number;
}

export interface StoredCollectionState {
  readonly id: string;
  readonly name: string;
  readonly ctag: string | null;
  readonly syncToken: string | null;
}

export function storedCollections(metadata: Readonly<Record<string, unknown>>): Readonly<Record<string, StoredCollectionState>> {
  const caldav = metadata.caldav;
  if (!caldav || typeof caldav !== "object") return {};
  const collections = (caldav as Record<string, unknown>).collections;
  if (!collections || typeof collections !== "object") return {};
  const result: Record<string, StoredCollectionState> = {};
  for (const [id, value] of Object.entries(collections)) {
    if (!value || typeof value !== "object") continue;
    const state = value as Record<string, unknown>;
    result[id] = {
      id,
      name: typeof state.name === "string" ? state.name : id,
      ctag: typeof state.ctag === "string" ? state.ctag : null,
      syncToken: typeof state.syncToken === "string" ? state.syncToken : null
    };
  }
  return result;
}
