alter table public.goals
  add column level text not null default 'LONG_TERM'
    check (level in ('LONG_TERM','MONTHLY','WEEKLY')),
  add column parent_goal_id uuid,
  add column period_start date,
  add column period_end date,
  add column progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  add column updated_at timestamptz not null default now(),
  add constraint goals_parent_owner_fk
    foreign key (parent_goal_id,user_id) references public.goals(id,user_id),
  add constraint goals_period_order_ck
    check (period_end is null or period_start is null or period_end >= period_start),
  add constraint goals_not_self_parent_ck
    check (parent_goal_id is null or parent_goal_id <> id);

alter table public.tasks add column planned_date date;

create index goals_user_level_period on public.goals(user_id,level,period_start,period_end)
  where status='active';
create index tasks_user_planned_date on public.tasks(user_id,planned_date)
  where status<>'DONE';
