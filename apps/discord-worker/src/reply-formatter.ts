import type { Task } from "@amber/core";

export function formatTaskCreatedReply(task: Task, timeZone: string): string {
  const details = [
    task.officialDeadline ? `마감: ${formatDate(task.officialDeadline, timeZone)}` : null,
    task.estimatedMinutes !== null ? `예상: ${formatDuration(task.estimatedMinutes)}` : null
  ].filter((value): value is string => value !== null);
  return [`✅ 기록했어: ${task.title}`, details.join(" · ")].filter(Boolean).join("\n");
}

export function formatConfirmationReply(questions: readonly string[]): string {
  return questions.length > 0 ? questions.join("\n") : "기록하려면 조금 더 알려줘.";
}

function formatDate(value: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return `${parts.month}/${parts.day}(${parts.weekday})`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}시간` : `${hours}시간 ${remainder}분`;
}
