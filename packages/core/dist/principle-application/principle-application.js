import { getDaysUntilDeadline } from "../rules/deadline.js";
const compare = (left, right) => left.rank - right.rank
    || right.importance - left.importance
    || (left.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER)
    || left.title.localeCompare(right.title);
const supportsDeadlinePreference = (principle) => principle.origin === "pattern_observed"
    && principle.applicationPolicy === "deadline_over_routine";
export const applyApprovedPrinciples = (candidates, principles, now, timeZone) => {
    const baseline = [...candidates].sort(compare);
    const applicable = principles.filter(supportsDeadlinePreference);
    if (applicable.length === 0 || !baseline.some((item) => item.type === "routine")) {
        return { candidates: baseline, usedPrincipleIds: [], explanation: null };
    }
    const adjusted = baseline.map((candidate) => {
        if (candidate.type !== "task")
            return candidate;
        const days = getDaysUntilDeadline(candidate.deadline, now, timeZone);
        return days !== null && days >= 0 && days <= 3
            ? { ...candidate, rank: Math.max(1, candidate.rank - 2) }
            : candidate;
    }).sort(compare);
    const changed = adjusted.some((candidate, index) => candidate.id !== baseline[index]?.id);
    return changed
        ? {
            candidates: adjusted,
            usedPrincipleIds: applicable.map((principle) => principle.id),
            explanation: "이전에 승인한 기준대로 마감이 가까운 Task를 먼저 배치했어."
        }
        : { candidates: baseline, usedPrincipleIds: [], explanation: null };
};
//# sourceMappingURL=principle-application.js.map