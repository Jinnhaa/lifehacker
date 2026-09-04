import type { Clock } from "@amber/shared";
import {
  CalendarSyncTokenExpiredError,
  type CalendarIntegrationAccount,
  type CalendarSyncResult,
  type CalendarSyncWindow,
  type GoogleCalendarClient,
  type NormalizedCalendarEvent
} from "./contracts.js";
import type { CalendarSyncRepository } from "./calendar-sync-repository.js";

const PAST_WINDOW_DAYS = 7;
const FUTURE_WINDOW_DAYS = 90;

export class CalendarSyncService {
  constructor(
    private readonly client: GoogleCalendarClient,
    private readonly repository: CalendarSyncRepository,
    private readonly clock: Clock
  ) {}

  async sync(account: CalendarIntegrationAccount): Promise<CalendarSyncResult> {
    if (account.syncToken) {
      try {
        return await this.incremental(account);
      } catch (error) {
        if (!(error instanceof CalendarSyncTokenExpiredError)) throw error;
        return this.full(account, "full_after_token_expiry");
      }
    }
    return this.full(account, "full");
  }

  private async full(account: CalendarIntegrationAccount, mode: "full" | "full_after_token_expiry"): Promise<CalendarSyncResult> {
    const synchronizedAt = this.clock.now();
    const window = syncWindow(synchronizedAt);
    const collected = await this.collect({
      calendarId: account.calendarId,
      timeMin: window.start.toISOString(),
      timeMax: window.end.toISOString()
    });
    const applied = await this.repository.applySync({
      account, events: collected.events, nextSyncToken: collected.nextSyncToken,
      fullSync: true, window, synchronizedAt
    });
    return { mode, received: collected.events.length, ...applied, nextSyncToken: collected.nextSyncToken };
  }

  private async incremental(account: CalendarIntegrationAccount): Promise<CalendarSyncResult> {
    const synchronizedAt = this.clock.now();
    const collected = await this.collect({ calendarId: account.calendarId, syncToken: account.syncToken! });
    const applied = await this.repository.applySync({
      account, events: collected.events, nextSyncToken: collected.nextSyncToken,
      fullSync: false, window: syncWindow(synchronizedAt), synchronizedAt
    });
    return { mode: "incremental", received: collected.events.length, ...applied, nextSyncToken: collected.nextSyncToken };
  }

  private async collect(initial: Parameters<GoogleCalendarClient["listEvents"]>[0]): Promise<{ events: NormalizedCalendarEvent[]; nextSyncToken: string }> {
    const events: NormalizedCalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const page = await this.client.listEvents({ ...initial, ...(pageToken && { pageToken }) });
      events.push(...page.events);
      pageToken = page.nextPageToken;
      if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
    } while (pageToken);
    if (!nextSyncToken) throw new Error("Google Calendar response lacks nextSyncToken");
    return { events, nextSyncToken };
  }
}

function syncWindow(now: Date): CalendarSyncWindow {
  return {
    start: new Date(now.getTime() - PAST_WINDOW_DAYS * 86_400_000),
    end: new Date(now.getTime() + FUTURE_WINDOW_DAYS * 86_400_000)
  };
}
