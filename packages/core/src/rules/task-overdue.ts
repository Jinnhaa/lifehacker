/** A missed target belongs in review, not in today's automatic execution queue. */
export function isTaskOverdue(task: {
  status: string;
  internalDeadline: Date | null;
  officialDeadline: Date | null;
}, now: Date, timeZone: string): boolean {
  if (task.status === "DONE") return false;
  const localDate = (value: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(value);
  return Boolean((task.internalDeadline && localDate(task.internalDeadline) < localDate(now))
    || (task.officialDeadline && task.officialDeadline < now));
}
