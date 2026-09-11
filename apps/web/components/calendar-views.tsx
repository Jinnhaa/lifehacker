"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { HomeTimelineItem, HomeWeekDay } from "../lib/home-types";

const HOUR_HEIGHT = 34;
const kindLabel: Record<HomeTimelineItem["kind"], string> = {
  task: "업무", routine: "루틴", rest: "휴식", buffer: "버퍼", calendar: "고정 일정"
};

const parts = (value: string, timeZone: string) => {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(value));
  const read = (type: string) => Number(fields.find((field) => field.type === type)?.value ?? 0);
  return { hour: read("hour"), minute: read("minute") };
};

const minuteOfDay = (value: string, timeZone: string) => {
  const valueParts = parts(value, timeZone);
  return valueParts.hour * 60 + valueParts.minute;
};

const itemBounds = (item: HomeTimelineItem, timeZone: string) => {
  const start = minuteOfDay(item.startsAt, timeZone);
  const rawEnd = minuteOfDay(item.endsAt, timeZone);
  const durationEnd = start + Math.max(0, item.minutes);
  return { start, end: rawEnd <= start && durationEnd > start ? Math.min(1440, durationEnd) : rawEnd };
};

const zonedRangeFor = (items: readonly HomeTimelineItem[], timeZone: string) => {
  if (!items.length) return { start: 8, end: 22 };
  const bounds = items.map((item) => itemBounds(item, timeZone));
  const starts = bounds.map((item) => item.start);
  const ends = bounds.map((item) => item.end);
  const start = Math.max(0, Math.floor(Math.min(...starts) / 60) - 1);
  return { start, end: Math.min(24, Math.max(Math.ceil(Math.max(...ends) / 60) + 1, start + 8)) };
};

const timeLabel = (value: string, timeZone: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(new Date(value));

const hoursIn = (range: { start: number; end: number }) => Array.from(
  { length: range.end - range.start + 1 }, (_, index) => range.start + index
);

const blockStyle = (item: HomeTimelineItem, range: { start: number; end: number }, timeZone: string): CSSProperties => {
  const bounds = itemBounds(item, timeZone);
  const startMinute = Math.max(range.start * 60, bounds.start);
  const endMinute = Math.min(range.end * 60, bounds.end);
  return {
    top: `${((startMinute - range.start * 60) / 60) * HOUR_HEIGHT}px`,
    height: `${Math.max(18, ((endMinute - startMinute) / 60) * HOUR_HEIGHT)}px`
  };
};

function CalendarGrid({ items, timeZone, range, compact = false }: {
  items: readonly HomeTimelineItem[];
  timeZone: string;
  range: { start: number; end: number };
  compact?: boolean;
}) {
  return <div className={`block-calendar ${compact ? "compact" : ""}`} style={{ height: (range.end - range.start) * HOUR_HEIGHT }}>
    {hoursIn(range).map((hour) => <div className="calendar-hour" style={{ top: (hour - range.start) * HOUR_HEIGHT }} key={hour}>
      {!compact && <time>{String(hour).padStart(2, "0")}:00</time>}<i />
    </div>)}
    {items.map((item) => <article
      className={`calendar-block ${item.kind} ${item.current ? "current" : ""} ${item.status === "completed" ? "completed" : ""}`}
      style={blockStyle(item, range, timeZone)} key={`${item.kind}:${item.id}`}
      title={`${timeLabel(item.startsAt, timeZone)}–${timeLabel(item.endsAt, timeZone)} ${item.title}`}
    >
      {item.current && <b>NOW</b>}<strong>{item.title}</strong>
      <small>{timeLabel(item.startsAt, timeZone)} · {item.context ?? kindLabel[item.kind]}</small>
    </article>)}
  </div>;
}

export function TodayCalendar({ items, timeZone, onOpenWeek }: {
  items: readonly HomeTimelineItem[];
  timeZone: string;
  onOpenWeek: () => void;
}) {
  const range = useMemo(() => zonedRangeFor(items, timeZone), [items, timeZone]);
  return <section className="today-board" data-testid="today-flow" aria-labelledby="today-board-title">
    <span className="board-clip left" /><span className="board-clip right" />
    <header><div><small>LIVE PLAN</small><h2 id="today-board-title">오늘 흐름</h2></div><button type="button" onClick={onOpenWeek}>이번 주 ↗</button></header>
    <div className="board-rule" />
    <div className="day-calendar-scroll">{items.length
      ? <CalendarGrid items={items} timeZone={timeZone} range={range} />
      : <><CalendarGrid items={[]} timeZone={timeZone} range={range} /><p className="board-empty">승인 계획에 표시할 항목이 없습니다.</p></>}
    </div>
  </section>;
}

const dayName = (date: string) => new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(new Date(`${date}T12:00:00Z`));

export function WeekCalendarOverlay({ days, today, timeZone, onClose }: {
  days: readonly HomeWeekDay[];
  today: string;
  timeZone: string;
  onClose: () => void;
}) {
  const todayRef = useRef<HTMLDivElement>(null);
  const allItems = days.flatMap((day) => day.items);
  const range = useMemo(() => zonedRangeFor(allItems, timeZone), [allItems, timeZone]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="week-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="week-panel" role="dialog" aria-modal="true" aria-labelledby="week-title">
      <header><div><small>WEEK PLAN</small><h2 id="week-title">이번 주 일정</h2></div><div><button type="button" onClick={() => todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" })}>오늘</button><button className="week-close" type="button" onClick={onClose} aria-label="주간 보기 닫기">×</button></div></header>
      <div className="week-scroll">
        <div className="week-time-axis" style={{ height: (range.end - range.start) * HOUR_HEIGHT }}>
          {hoursIn(range).map((hour) => <time style={{ top: (hour - range.start) * HOUR_HEIGHT }} key={hour}>{String(hour).padStart(2, "0")}:00</time>)}
        </div>
        <div className="week-days">
          {days.map((day, index) => <div ref={day.date === today ? todayRef : undefined} className={`week-day ${day.date === today ? "today" : ""} ${index > 4 ? "weekend" : ""}`} key={day.date}>
            <h3><span>{dayName(day.date)}</span><b>{Number(day.date.slice(-2))}</b></h3>
            <CalendarGrid items={day.items} timeZone={timeZone} range={range} compact />
          </div>)}
        </div>
      </div>
    </section>
  </div>;
}
