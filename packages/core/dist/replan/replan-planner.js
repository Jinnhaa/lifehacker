import { zonedDateTimeToUtc } from "@amber/shared";
import { createMorningPlan } from "../morning/morning-planner.js";
const MINUTE = 60_000;
const inactiveStatuses = new Set(["completed", "blocked", "switched", "skipped", "cancelled"]);
const minutes = (start, end) => Math.max(0, Math.floor((end.getTime() - start.getTime()) / MINUTE));
const localWeekday = (value, timeZone) => {
    const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(value);
    return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[label] ?? 1;
};
export const resolveReplanWorkUntil = (observation, previous) => {
    const configured = observation.planningPolicy.defaultWorkUntil ?? observation.planningPolicy.workUntil;
    return typeof configured === "string" && /^\d{2}:\d{2}$/.test(configured)
        ? zonedDateTimeToUtc(`${previous.planDate}T${configured}:00`, previous.timeZone)
        : previous.workUntil;
};
export const applyDirectPlanEdit = (previous, edit, context = null) => {
    const target = previous.items.find((item) => item.id === edit.itemId);
    if (!target)
        throw new Error("수정할 계획 항목을 찾지 못했습니다.");
    const after = edit.kind === "exclude" ? null : {
        start: edit.start,
        end: new Date(edit.start.getTime() + edit.durationMinutes * MINUTE),
        durationMinutes: edit.durationMinutes
    };
    const affectedItems = after ? previous.items.filter((item) => item.id !== target.id
        && item.start < after.end && item.end > after.start).map((item) => ({ itemId: item.id, title: item.title })) : [];
    const totalMinutesBefore = previous.items.reduce((sum, item) => sum + item.plannedMinutes, 0);
    const totalMinutesAfter = totalMinutesBefore - target.plannedMinutes + (after?.durationMinutes ?? 0);
    const items = previous.items.flatMap((item) => {
        if (item.id !== target.id)
            return [{
                    itemType: item.itemType, title: item.title, plannedMinutes: item.plannedMinutes, start: item.start, end: item.end,
                    ...(item.taskId ? { taskId: item.taskId } : {}),
                    ...(item.recurringActivityId ? { recurringActivityId: item.recurringActivityId } : {})
                }];
        if (!after)
            return [];
        return [{
                itemType: item.itemType, title: item.title, plannedMinutes: after.durationMinutes, start: after.start, end: after.end,
                ...(item.taskId ? { taskId: item.taskId } : {}),
                ...(item.recurringActivityId ? { recurringActivityId: item.recurringActivityId } : {})
            }];
    }).sort((left, right) => left.start.getTime() - right.start.getTime());
    return {
        draft: {
            items, fixedEvents: [], highlights: [`사용자 직접 수정: ${target.title}`],
            inputSnapshot: { workUntil: previous.workUntil.toISOString(), privateIntervals: previous.privateIntervals }
        },
        interpretation: {
            itemId: target.id, title: target.title, itemType: target.itemType, context,
            before: { start: target.start, end: target.end, durationMinutes: target.plannedMinutes }, after,
            affectedItems, totalMinutesBefore, totalMinutesAfter
        }
    };
};
const subtractIntervals = (source, occupied) => {
    let result = [source];
    for (const blocked of occupied) {
        result = result.flatMap((value) => {
            if (blocked.end <= value.start || blocked.start >= value.end)
                return [value];
            const pieces = [];
            if (blocked.start > value.start)
                pieces.push({ start: value.start, end: blocked.start });
            if (blocked.end < value.end)
                pieces.push({ start: blocked.end, end: value.end });
            return pieces;
        });
    }
    return result;
};
export const buildReplanDraft = (input) => {
    const { observation, previous, now, adjustment } = input;
    const configuredWorkUntil = resolveReplanWorkUntil(observation, previous);
    const requestedWorkUntil = adjustment?.kind === "exclude_after"
        ? zonedDateTimeToUtc(`${previous.planDate}T${adjustment.localTime}:00`, previous.timeZone)
        : configuredWorkUntil;
    const workUntil = requestedWorkUntil < configuredWorkUntil ? requestedWorkUntil : configuredWorkUntil;
    const remaining = previous.items.filter((item) => item.end > now && !inactiveStatuses.has(item.status));
    const unavailableTaskIds = new Set(previous.items.flatMap((item) => item.taskId && (item.status === "blocked" || item.status === "switched" || item.taskStatus === "BLOCKED")
        && item.taskId !== previous.activeTaskId ? [item.taskId] : []));
    let tasks = observation.tasks.filter((task) => !unavailableTaskIds.has(task.id));
    const currentTaskId = previous.activeTaskId
        ?? remaining.find((item) => item.itemType === "task" && item.taskId)?.taskId
        ?? null;
    if (adjustment?.kind === "defer_current" && currentTaskId) {
        tasks = tasks.filter((task) => task.id !== currentTaskId);
    }
    if (adjustment?.kind === "prioritize_task") {
        const query = adjustment.taskQuery.toLocaleLowerCase();
        tasks = tasks.map((task) => task.title.toLocaleLowerCase().includes(query) ? { ...task, importance: 5 } : task);
    }
    if (adjustment?.kind === "reduce_today" && tasks.length > 1) {
        const lowest = [...tasks].sort((left, right) => left.importance - right.importance || right.updatedAt.getTime() - left.updatedAt.getTime())[0];
        tasks = tasks.filter((task) => task.id !== lowest.id);
    }
    if (previous.activeTaskId) {
        const active = tasks.find((task) => task.id === previous.activeTaskId);
        const oldMinutes = remaining.filter((item) => item.taskId === previous.activeTaskId)
            .reduce((sum, item) => sum + minutes(new Date(Math.max(item.start.getTime(), now.getTime())), item.end), 0);
        if (active && (active.estimatedUserMinutes ?? active.estimatedMinutes ?? 0) - active.actualMinutes <= 0 && oldMinutes > 0) {
            tasks = tasks.map((task) => task.id === active.id
                ? { ...task, estimatedUserMinutes: task.actualMinutes + oldMinutes }
                : task);
        }
    }
    const remainingBuffers = remaining.filter((item) => item.itemType === "buffer")
        .reduce((sum, item) => sum + minutes(new Date(Math.max(item.start.getTime(), now.getTime())), item.end), 0);
    const maximumWorkMinutes = remaining.filter((item) => item.itemType === "task" || item.itemType === "routine")
        .reduce((sum, item) => sum + minutes(new Date(Math.max(item.start.getTime(), now.getTime())), item.end), 0);
    const protectedIntervals = observation.constraints.filter((value) => value.blocksCapacity)
        .map((value) => ({ start: value.start, end: value.end }));
    const restItems = remaining.filter((item) => item.itemType === "rest").flatMap((item) => subtractIntervals({ start: new Date(Math.max(item.start.getTime(), now.getTime())), end: new Date(Math.min(item.end.getTime(), workUntil.getTime())) }, protectedIntervals)
        .filter((value) => value.end > value.start)
        .map((value) => ({
        itemType: "rest",
        title: item.title,
        plannedMinutes: minutes(value.start, value.end),
        start: value.start,
        end: value.end
    })));
    const restIntervals = restItems.map((item) => ({ start: item.start, end: item.end }));
    const requestedRest = adjustment?.kind === "unavailable"
        ? [{
                itemType: "rest",
                title: adjustment.summary,
                plannedMinutes: adjustment.durationMinutes,
                start: now,
                end: new Date(Math.min(workUntil.getTime(), now.getTime() + adjustment.durationMinutes * MINUTE))
            }].filter((item) => item.end > item.start)
        : [];
    const adjusted = {
        ...observation,
        tasks,
        planningBufferMinutes: Math.max(observation.planningBufferMinutes, remainingBuffers)
    };
    const planned = createMorningPlan({
        observation: adjusted,
        now,
        workUntil,
        privateIntervals: [
            ...previous.privateIntervals,
            ...restIntervals,
            ...requestedRest.map((item) => ({ start: item.start, end: item.end }))
        ],
        localWeekday: localWeekday(now, previous.timeZone),
        maximumWorkMinutes
    });
    return {
        ...planned,
        items: [...planned.items, ...restItems, ...requestedRest].sort((left, right) => left.start.getTime() - right.start.getTime()),
        inputSnapshot: {
            ...planned.inputSnapshot,
            previousPlanId: previous.planId,
            previousRevisionNo: previous.revisionNo
        }
    };
};
//# sourceMappingURL=replan-planner.js.map