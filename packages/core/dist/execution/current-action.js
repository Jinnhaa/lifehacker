export const deriveCurrentAction = async (sql, userId, planDate) => {
    const focus = await sql `
    select t.title,f.task_id,f.plan_item_id
    from public.focus_sessions f join public.tasks t on t.id=f.task_id and t.user_id=f.user_id
    where f.user_id=${userId} and f.status='active'
    order by f.started_at desc limit 1
  `;
    if (focus[0]) {
        return {
            kind: "task",
            source: "focus_session",
            title: focus[0].title,
            taskId: focus[0].task_id,
            planItemId: focus[0].plan_item_id
        };
    }
    const items = await sql `
    select i.item_type,i.id plan_item_id,i.task_id,i.activity_occurrence_id,coalesce(t.title,a.title) title
    from public.daily_plans p
    join public.plan_items i on i.daily_plan_id=p.id and i.user_id=p.user_id
    left join public.tasks t on t.id=i.task_id and t.user_id=i.user_id
    left join public.activity_occurrences o on o.id=i.activity_occurrence_id and o.user_id=i.user_id
    left join public.recurring_activities a on a.id=o.recurring_activity_id and a.user_id=o.user_id
    where p.user_id=${userId} and p.plan_date=${planDate} and p.status='approved'
      and i.item_type in ('task','routine') and i.status in ('planned','in_progress')
      and (t.id is null or t.status in ('INBOX','PLANNED','IN_PROGRESS'))
      and (o.id is null or o.status in ('planned','in_progress','partial'))
    order by i.position limit 1
  `;
    const item = items[0];
    if (!item)
        return null;
    return item.item_type === "task"
        ? {
            kind: "task",
            source: "plan_item",
            title: item.title,
            taskId: item.task_id,
            planItemId: item.plan_item_id
        }
        : {
            kind: "routine",
            source: "plan_item",
            title: item.title,
            activityOccurrenceId: item.activity_occurrence_id,
            planItemId: item.plan_item_id
        };
};
//# sourceMappingURL=current-action.js.map