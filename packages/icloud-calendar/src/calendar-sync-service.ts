import type { Clock } from "@amber/shared";
import type { ICloudCalendarSyncRepository } from "./calendar-sync-repository.js";
import {
  storedCollections,
  type ICloudCalDavReader,
  type ICloudCalendarAccount,
  type ICloudCalendarCollection,
  type ICloudSyncResult
} from "./contracts.js";

const DAY_MS = 86_400_000;

export class ICloudCalendarSyncService {
  constructor(
    private readonly reader: ICloudCalDavReader,
    private readonly repository: ICloudCalendarSyncRepository,
    private readonly clock: Clock
  ) {}

  async sync(account: ICloudCalendarAccount): Promise<ICloudSyncResult> {
    const synchronizedAt = this.clock.now();
    const window = {
      start: new Date(synchronizedAt.getTime() - 7 * DAY_MS),
      end: new Date(synchronizedAt.getTime() + 90 * DAY_MS)
    };
    const discovery = await this.reader.discover();
    const previous = storedCollections(account.metadata);
    const discoveredIds = new Set(discovery.collections.map((collection) => collection.id));
    let fetchedCalendars = 0;
    let skippedCalendars = 0;
    let received = 0;
    let active = 0;
    let deleted = 0;

    for (const collection of discovery.collections) {
      const existing = previous[collection.id];
      if (collection.ctag && existing?.ctag === collection.ctag) {
        skippedCalendars += 1;
        continue;
      }
      const batch = await this.reader.fetchCollection(collection, window);
      const applied = await this.repository.applyCollectionSync({ account, collection, events: batch.events, window, synchronizedAt });
      fetchedCalendars += 1;
      received += batch.events.length;
      active += applied.active;
      deleted += applied.deleted;
    }

    for (const collection of Object.values(previous)) {
      if (discoveredIds.has(collection.id)) continue;
      const removed: ICloudCalendarCollection = { ...collection, timeZone: null };
      const applied = await this.repository.applyCollectionSync({ account, collection: removed, events: [], window, synchronizedAt, collectionRemoved: true });
      deleted += applied.deleted;
    }

    await this.repository.saveDiscovery(account, discovery, synchronizedAt);
    return {
      discoveredCalendars: discovery.collections.length,
      fetchedCalendars,
      skippedCalendars,
      received,
      active,
      deleted
    };
  }
}
