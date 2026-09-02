create table public.goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid, title text not null, description text, importance smallint not null check (importance between 1 and 5),
  status text not null check (status in ('active','archived')), origin text not null,
  created_at timestamptz not null default now(), archived_at timestamptz,
  unique (id,user_id), foreign key (scope_id,user_id) references public.scopes(id,user_id)
);

create table public.work_contexts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid, kind text not null check (kind in ('project','course')), title text not null, description text,
  status text not null, start_date date, end_date date,
  agent_mode text not null check (agent_mode in ('auto','disabled','not_applicable')),
  created_at timestamptz not null default now(), archived_at timestamptz,
  unique (id,user_id), foreign key (scope_id,user_id) references public.scopes(id,user_id),
  check ((kind='course' and agent_mode='not_applicable') or kind='project')
);

create table public.objectives (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid, goal_id uuid, work_context_id uuid, title text not null, target_date date, success_criteria text,
  importance smallint not null check (importance between 1 and 5), status text not null, origin text not null,
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique (id,user_id), foreign key (scope_id,user_id) references public.scopes(id,user_id),
  foreign key (goal_id,user_id) references public.goals(id,user_id),
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id)
);

create table public.course_profiles (
  work_context_id uuid primary key, user_id uuid not null, target_grade text, term text, instructor text,
  self_reported_understanding smallint check (self_reported_understanding between 1 and 5),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (work_context_id,user_id), foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade
);

create table public.recurring_activities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid, title text not null, category text not null check (category in ('study','household','exercise','self_care','other')),
  period text not null check (period='week'), target_count smallint not null check (target_count > 0),
  expected_minutes integer not null check (expected_minutes > 0), minimum_minutes integer,
  scheduling_mode text not null, preferred_days smallint[], preferred_time_window jsonb,
  importance smallint not null check (importance between 1 and 5), effective_from date not null, effective_until date,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), foreign key (goal_id,user_id) references public.goals(id,user_id),
  check (minimum_minutes is null or (minimum_minutes > 0 and minimum_minutes <= expected_minutes)),
  check (effective_until is null or effective_until >= effective_from)
);

create table public.activity_occurrences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  recurring_activity_id uuid not null, period_key text not null, sequence_no smallint not null check (sequence_no > 0),
  planned_date date, planned_start_at timestamptz, started_at timestamptz, ended_at timestamptz,
  actual_minutes integer check (actual_minutes >= 0), status text not null check (status in ('planned','in_progress','partial','completed','skipped','cancelled')),
  counts_toward_target boolean not null default true, created_at timestamptz not null default now(),
  unique (id,user_id), unique (recurring_activity_id,period_key,sequence_no),
  foreign key (recurring_activity_id,user_id) references public.recurring_activities(id,user_id) on delete cascade
);
