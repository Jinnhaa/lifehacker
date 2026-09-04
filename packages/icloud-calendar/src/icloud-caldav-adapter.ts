import type { CalendarSyncWindow } from "@amber/shared";
import { DAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";
import type {
  ICloudCalDavReader,
  ICloudCalendarCollection,
  ICloudCollectionSync,
  ICloudDiscovery
} from "./contracts.js";
import { normalizeICloudCalendarObject } from "./ical-normalizer.js";

export interface CalDavTransport {
  login(): Promise<{ principalUrl: string; calendarHomeUrl: string }>;
  listCalendars(): Promise<readonly ICloudCalendarCollection[]>;
  listCalendarObjects(collection: ICloudCalendarCollection, window: CalendarSyncWindow): Promise<readonly { url: string; etag: string | null; data: string }[]>;
}

export interface ICloudCalDavAdapterOptions {
  readonly baseUrl: string;
  readonly appleId: string;
  readonly appPassword: string;
  readonly userTimeZone: string;
  readonly transport?: CalDavTransport;
  readonly fetch?: typeof globalThis.fetch;
}

export class ICloudCalDavAdapter implements ICloudCalDavReader {
  private readonly transport: CalDavTransport;

  constructor(private readonly options: ICloudCalDavAdapterOptions) {
    this.transport = options.transport ?? new TsdavCalDavTransport(options);
  }

  async discover(): Promise<ICloudDiscovery> {
    const account = await this.transport.login();
    const collections = await this.transport.listCalendars();
    return { ...account, collections };
  }

  async fetchCollection(collection: ICloudCalendarCollection, window: CalendarSyncWindow): Promise<ICloudCollectionSync> {
    const objects = await this.transport.listCalendarObjects(collection, window);
    return {
      collection,
      events: objects.flatMap((object) => normalizeICloudCalendarObject({
        data: object.data,
        etag: object.etag,
        objectUrl: object.url,
        collection,
        window,
        userTimeZone: this.options.userTimeZone
      }))
    };
  }
}

class TsdavCalDavTransport implements CalDavTransport {
  private readonly client: DAVClient;
  private calendars = new Map<string, DAVCalendar>();

  constructor(options: ICloudCalDavAdapterOptions) {
    this.client = new DAVClient({
      serverUrl: options.baseUrl,
      credentials: { username: options.appleId, password: options.appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
      ...(options.fetch && { fetch: options.fetch })
    });
  }

  async login(): Promise<{ principalUrl: string; calendarHomeUrl: string }> {
    await this.client.login({ loadCollections: false, loadObjects: false });
    const principalUrl = this.client.account?.principalUrl;
    const calendarHomeUrl = this.client.account?.homeUrl;
    if (!principalUrl || !calendarHomeUrl) throw new Error("CalDAV discovery did not return principal and calendar home URLs");
    return { principalUrl, calendarHomeUrl };
  }

  async listCalendars(): Promise<readonly ICloudCalendarCollection[]> {
    const calendars = await this.client.fetchCalendars();
    this.calendars = new Map(calendars.map((calendar) => [calendar.url, calendar]));
    return calendars.map((calendar) => ({
      id: calendar.url,
      name: typeof calendar.displayName === "string" ? calendar.displayName : calendar.url,
      ctag: calendar.ctag ?? null,
      syncToken: calendar.syncToken ?? null,
      timeZone: typeof calendar.timezone === "string" && calendar.timezone.length > 0 && !calendar.timezone.includes("BEGIN:") ? calendar.timezone : null
    }));
  }

  async listCalendarObjects(collection: ICloudCalendarCollection, window: CalendarSyncWindow): Promise<readonly { url: string; etag: string | null; data: string }[]> {
    const calendar = this.calendars.get(collection.id);
    if (!calendar) throw new Error("CalDAV calendar collection was not discovered");
    const objects = await this.client.fetchCalendarObjects({
      calendar,
      timeRange: { start: window.start.toISOString(), end: window.end.toISOString() },
      expand: true,
      useMultiGet: true
    });
    return objects.flatMap((object: DAVCalendarObject) => typeof object.data === "string"
      ? [{ url: object.url, etag: object.etag ?? null, data: object.data }]
      : []);
  }
}
