import type { ExplicitTaskFacts, ParsedTaskDraft, Provenance } from "./contracts.js";

const getZonedParts = (value: Date, timeZone: string): Record<string, number> =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
  );

const zonedDateTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date => {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = getZonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
    candidate += desired - represented;
  }
  return new Date(candidate);
};

const relativeDeadline = (receivedAt: Date, dayOffset: number, timeZone: string): string => {
  const parts = getZonedParts(receivedAt, timeZone);
  const localDate = new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day! + dayOffset));
  return zonedDateTimeToUtc(
    localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate(), 23, 59, 59, timeZone
  ).toISOString();
};

export const extractExplicitTaskFacts = (text: string, receivedAt: Date, timeZone: string): ExplicitTaskFacts => {
  const duration = text.match(/(?:^|\s)(\d+)\s*(?:분|minutes?)(?=\s|$|이면|정도)/i);
  const durationHours = text.match(/(?:^|\s)(\d+)\s*(?:시간|hours?)(?=\s|$|이면|정도)/i);
  const importance = text.match(/(?:중요도|importance)\s*[:=]?\s*([1-5])/i);
  const isoDate = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  let officialDeadline: string | undefined;
  if (/내일|\btomorrow\b/i.test(text)) officialDeadline = relativeDeadline(receivedAt, 1, timeZone);
  else if (/오늘|\btoday\b/i.test(text)) officialDeadline = relativeDeadline(receivedAt, 0, timeZone);
  else if (isoDate) {
    officialDeadline = zonedDateTimeToUtc(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]), 23, 59, 59, timeZone).toISOString();
  }
  return {
    ...(officialDeadline && { officialDeadline }),
    ...(duration?.[1]
      ? { estimatedMinutes: Number(duration[1]) }
      : durationHours?.[1] ? { estimatedMinutes: Number(durationHours[1]) * 60 } : {}),
    ...(importance?.[1] && { importance: Number(importance[1]) as 1 | 2 | 3 | 4 | 5 })
  };
};

export const applyExplicitTaskFacts = (
  draft: ParsedTaskDraft,
  provenance: Record<string, Provenance>,
  explicit: ExplicitTaskFacts
): { draft: ParsedTaskDraft; provenance: Record<string, Provenance> } => {
  const fields = Object.keys(explicit) as Array<keyof ExplicitTaskFacts>;
  const inferred = draft.inferredFields.filter((field) => !fields.includes(field as keyof ExplicitTaskFacts));
  return {
    draft: { ...draft, ...explicit, inferredFields: inferred },
    provenance: Object.fromEntries([
      ...Object.entries(provenance),
      ...fields.map((field) => [field, "user_explicit" as const])
    ])
  };
};
