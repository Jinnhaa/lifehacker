import type { HomePlanReview, HomeTimelineItem } from "./home-types";

export const activeHomeQuests = (items: readonly HomeTimelineItem[], currentTaskId: string | null) =>
  items.filter((item) => (item.kind === "task" || item.kind === "routine") && item.source !== "pending"
    && item.status !== "completed" && !item.current && (currentTaskId === null || item.taskId !== currentTaskId));

export const splitTodayPlan = (items: HomePlanReview["items"]) => ({
  quests: items.filter((item) => item.itemType !== "calendar" && item.itemType !== "rest" && item.itemType !== "buffer"),
  fixed: items.filter((item) => item.itemType === "calendar")
});

export function remainingAvailableMinutes(snapshot: unknown, now: Date, protectedItems: readonly HomeTimelineItem[]): number | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const data = snapshot as Record<string, unknown>;
  const end = new Date(String(data.workUntil));
  if (Number.isNaN(end.getTime())) return null;
  const from = now.getTime();
  const until = end.getTime();
  if (until <= from) return 0;
  const ranges: [number, number][] = [];
  const add = (start: unknown, finish: unknown) => {
    const a = new Date(String(start)).getTime();
    const b = new Date(String(finish)).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b > from && a < until) ranges.push([Math.max(from, a), Math.min(until, b)]);
  };
  for (const entry of Array.isArray(data.fixedEvents) ? data.fixedEvents : []) {
    if (entry && typeof entry === "object" && (entry as Record<string, unknown>).blocksCapacity === true) {
      const value = entry as Record<string, unknown>;
      add(value.start, value.end);
    }
  }
  for (const entry of Array.isArray(data.privateIntervals) ? data.privateIntervals : []) {
    if (entry && typeof entry === "object") {
      const value = entry as Record<string, unknown>;
      add(value.start, value.end);
    }
  }
  for (const item of protectedItems) if (item.kind === "rest" || item.kind === "buffer") add(item.startsAt, item.endsAt);
  ranges.sort((a, b) => a[0] - b[0]);
  let blocked = 0;
  let cursor = from;
  for (const [start, finish] of ranges) {
    blocked += Math.max(0, finish - Math.max(cursor, start));
    cursor = Math.max(cursor, finish);
  }
  return Math.max(0, Math.floor((until - from - blocked) / 60_000));
}
