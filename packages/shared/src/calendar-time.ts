export function zonedDateTimeToUtc(localDateTime: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(localDateTime);
  if (!match) throw new Error("Invalid local calendar date/time");
  const desired = Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)
  );
  let candidate = desired;
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(dateParts.formatToParts(new Date(candidate)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const delta = desired - represented;
    candidate += delta;
    if (delta === 0) return new Date(candidate);
  }
  return new Date(candidate);
}

export function parseCalendarDateTime(value: string, timeZone: string): Date {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid RFC3339 calendar timestamp");
    return parsed;
  }
  return zonedDateTimeToUtc(value, timeZone);
}
