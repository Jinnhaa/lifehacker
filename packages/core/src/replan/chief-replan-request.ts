export type ChiefReplanAdjustment =
  | { readonly kind: "unavailable"; readonly durationMinutes: number; readonly summary: string }
  | { readonly kind: "defer_current"; readonly summary: string }
  | { readonly kind: "prioritize_task"; readonly taskQuery: string; readonly summary: string }
  | { readonly kind: "reduce_today"; readonly summary: string }
  | { readonly kind: "exclude_after"; readonly localTime: string; readonly summary: string }
  | { readonly kind: "rebalance"; readonly summary: string };

const normalizeHour = (hour: number, meridiem: string | undefined): number => {
  if (meridiem === "오후" && hour < 12) return hour + 12;
  if (meridiem === "오전" && hour === 12) return 0;
  return hour;
};

export const interpretChiefReplanRequest = (raw: string): ChiefReplanAdjustment | null => {
  const text = raw.trim().replace(/\s+/g, " ");
  const forward = text.match(/(\d+(?:\.\d+)?)\s*(시간|분).*?(쉬|휴식|비우|unavailable)/i);
  const reverse = text.match(/(쉬|휴식|비우|unavailable).*?(\d+(?:\.\d+)?)\s*(시간|분)/i);
  const amount = forward ? Number(forward[1]) : reverse ? Number(reverse[2]) : null;
  const unit = forward?.[2] ?? reverse?.[3];
  if (amount !== null && unit) {
    const durationMinutes = Math.round(unit === "시간" ? amount * 60 : amount);
    if (durationMinutes >= 15 && durationMinutes <= 12 * 60) {
      return { kind: "unavailable", durationMinutes, summary: `${durationMinutes}분 동안 휴식` };
    }
  }
  if (/(현재|지금).*(작업|할 일).*(미루|뒤로|나중)/.test(text)) {
    return { kind: "defer_current", summary: "현재 작업을 뒤로 이동" };
  }
  if (/오늘.*(할 일|일정|업무).*(줄|덜|가볍)/.test(text)) {
    return { kind: "reduce_today", summary: "오늘 작업량 축소" };
  }
  const after = text.match(/(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{2}))?\s*시?\s*이후.*?(집중|작업|업무).*?(제외|빼|하지)/);
  if (after) {
    const hour = normalizeHour(Number(after[2]), after[1]);
    const minute = Number(after[3] ?? 0);
    if (hour < 24 && minute < 60) {
      const localTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return { kind: "exclude_after", localTime, summary: `${localTime} 이후 집중 작업 제외` };
    }
  }
  const prioritized = text.match(/^(.+?)(?:을|를)?\s*(?:우선순위(?:를)?\s*올|먼저\s*(?:해|배치)|우선\s*(?:해|배치))/);
  if (prioritized?.[1]) {
    const taskQuery = prioritized[1].replace(/^(특정\s*)?작업\s*/, "").trim();
    if (taskQuery) return { kind: "prioritize_task", taskQuery, summary: `${taskQuery} 우선 배치` };
  }
  if (text === "다시 짜줘" || text === "오늘 일정 다시 짜줘") {
    return { kind: "rebalance", summary: "현재 상태 기준 일정 재조정" };
  }
  return null;
};
