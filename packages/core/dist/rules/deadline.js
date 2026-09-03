import { calendarDayDifference } from "@amber/shared";
export const getDaysUntilDeadline = (deadline, now, timeZone) => deadline ? calendarDayDifference(deadline, now, timeZone) : null;
export const isDueToday = (deadline, now, timeZone) => getDaysUntilDeadline(deadline, now, timeZone) === 0;
export const isOverdue = (deadline, now) => deadline !== null && deadline.getTime() < now.getTime();
export const isDueWithin = (deadline, days, now, timeZone) => {
    if (days < 0)
        return false;
    const remaining = getDaysUntilDeadline(deadline, now, timeZone);
    return remaining !== null && remaining >= 0 && remaining <= days;
};
//# sourceMappingURL=deadline.js.map