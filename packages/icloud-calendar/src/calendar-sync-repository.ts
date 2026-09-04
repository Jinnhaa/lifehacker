import type { CalendarSyncWindow, NormalizedCalendarEvent } from "@amber/shared";
import type { ICloudCalendarAccount, ICloudCalendarCollection, ICloudDiscovery } from "./contracts.js";

export interface ApplyICloudCollectionSyncInput {
  readonly account: ICloudCalendarAccount;
  readonly collection: ICloudCalendarCollection;
  readonly events: readonly NormalizedCalendarEvent[];
  readonly window: CalendarSyncWindow;
  readonly synchronizedAt: Date;
  readonly collectionRemoved?: boolean;
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

export interface ICloudCalendarSyncRepository {
  getActiveAccount(userId: string): Promise<ICloudCalendarAccount | null>;
  applyCollectionSync(input: ApplyICloudCollectionSyncInput): Promise<{ active: number; deleted: number }>;
  saveDiscovery(account: ICloudCalendarAccount, discovery: ICloudDiscovery, synchronizedAt: Date): Promise<void>;
  listFixedTimeConstraints(userId: string, start: Date, end: Date): Promise<readonly FixedTimeConstraint[]>;
}
