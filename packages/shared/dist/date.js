const dayMilliseconds = 86_400_000;
const getDateParts = (value, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(value);
    const read = (type) => Number(parts.find((part) => part.type === type)?.value);
    return [read("year"), read("month"), read("day")];
};
export const calendarDayDifference = (later, earlier, timeZone) => {
    const [laterYear, laterMonth, laterDay] = getDateParts(later, timeZone);
    const [earlierYear, earlierMonth, earlierDay] = getDateParts(earlier, timeZone);
    return Math.round((Date.UTC(laterYear, laterMonth - 1, laterDay) - Date.UTC(earlierYear, earlierMonth - 1, earlierDay)) /
        dayMilliseconds);
};
//# sourceMappingURL=date.js.map