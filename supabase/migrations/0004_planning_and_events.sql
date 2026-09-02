create table public.daily_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null, timezone text not null, revision_no integer not null check (revision_no > 0),
  status text not null check (status in ('draft','pending_approval','approved','superseded','closed')),
  supersedes_plan_id uuid, approval_source text, approval_reason text, input_snapshot jsonb not null default '{}'::jsonb,
  created_by text not null, created_at timestamptz not null default now(), approved_at timestamptz, closed_at timestamptz,
  unique (id,user_id), unique (user_id,plan_date,revision_no),
  foreign key (supersedes_plan_id,user_id) references public.daily_plans(id,user_id)
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  daily_plan_id uuid not null, position integer not null check (position > 0),
  item_type text not null check (item_type in ('task','routine','rest','buffer')), task_id uuid, activity_occurrence_id uuid,
  planned_start_at timestamptz, planned_end_at timestamptz, planned_minutes integer not null check (planned_minutes >= 0),
  status text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), unique (daily_plan_id,position),
  foreign key (daily_plan_id,user_id) references public.daily_plans(id,user_id) on delete cascade,
  foreign key (task_id,user_id) references public.tasks(id,user_id),
  foreign key (activity_occurrence_id,user_id) references public.activity_occurrences(id,user_id),
  check ((item_type='task' and task_id is not null and activity_occurrence_id is null)
      or (item_type='routine' and task_id is null and activity_occurrence_id is not null)
      or (item_type in ('rest','buffer') and task_id is null and activity_occurrence_id is null)),
  check (planned_end_at is null or planned_start_at is null or planned_end_at >= planned_start_at)
);

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null, plan_item_id uuid, current_step_id uuid,
  status text not null check (status in ('active','paused','completed','cancelled')),
  started_at timestamptz not null, paused_at timestamptz, ended_at timestamptz, end_reason text,
  actual_minutes integer not null default 0 check (actual_minutes >= 0), created_at timestamptz not null default now(),
  unique (id,user_id), foreign key (task_id,user_id) references public.tasks(id,user_id),
  foreign key (plan_item_id,user_id) references public.plan_items(id,user_id),
  foreign key (current_step_id,user_id) references public.task_steps(id,user_id)
);

create table public.domain_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null, aggregate_type text not null, aggregate_id uuid not null, actor_type text not null, actor_id uuid,
  occurred_at timestamptz not null, recorded_at timestamptz not null default now(), correlation_id uuid not null,
  causation_id uuid, workflow_run_id uuid, idempotency_key text, payload_version integer not null check (payload_version > 0),
  payload jsonb not null default '{}'::jsonb, unique(id,user_id), unique(user_id,idempotency_key)
);
