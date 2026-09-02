create table public.tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  work_context_id uuid, objective_id uuid, title text not null, description text,
  execution_mode text not null check (execution_mode in ('standard','learning_required','output_focused','mixed')),
  official_deadline timestamptz, internal_deadline timestamptz, estimated_minutes integer check (estimated_minutes >= 0),
  estimated_user_minutes integer check (estimated_user_minutes >= 0), actual_minutes integer not null default 0 check (actual_minutes >= 0),
  importance smallint not null check (importance between 1 and 5),
  status text not null check (status in ('INBOX','PLANNED','IN_PROGRESS','BLOCKED','WAITING_FOR_USER','DONE')),
  next_action text, completion_criteria text, completion_source text, created_at timestamptz not null default now(),
  completed_at timestamptz, updated_at timestamptz not null default now(),
  unique (id,user_id), foreign key (work_context_id,user_id) references public.work_contexts(id,user_id),
  foreign key (objective_id,user_id) references public.objectives(id,user_id)
);

create table public.task_steps (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null, position integer not null check (position > 0), title text not null,
  owner text not null check (owner in ('user','ai')), estimated_minutes integer check (estimated_minutes >= 0),
  completion_criteria text, status text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), unique (task_id,position), foreign key (task_id,user_id) references public.tasks(id,user_id) on delete cascade
);

create table public.estimate_revisions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null, estimate_type text not null check (estimate_type in ('total','user')), minutes integer not null check (minutes >= 0),
  origin text not null check (origin in ('user','ai','system')), reason text, created_at timestamptz not null default now(),
  unique (id,user_id), foreign key (task_id,user_id) references public.tasks(id,user_id) on delete cascade
);

create table public.course_assessments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  course_context_id uuid not null, linked_task_id uuid,
  assessment_type text not null check (assessment_type in ('quiz','midterm','final','assignment','team_project','attendance','other')),
  title text not null, weight_percent numeric(5,2) check (weight_percent between 0 and 100), due_at timestamptz,
  score numeric, max_score numeric, submission_status text, provenance text not null, observed_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), foreign key (course_context_id,user_id) references public.work_contexts(id,user_id),
  foreign key (linked_task_id,user_id) references public.tasks(id,user_id)
);

create table public.constraints (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  constraint_type text not null check (constraint_type in ('availability','energy','personal_time','temporary_policy','hard_rule')),
  value jsonb not null, hardness text not null, valid_from timestamptz not null, valid_until timestamptz,
  reason text, origin text not null, created_at timestamptz not null default now(), unique(id,user_id)
);

create table public.strategic_directives (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  directive text not null, priority_order jsonb not null, scope_id uuid, reason text, origin text not null, created_by text not null,
  confirmation_status text not null, source_reference jsonb, valid_from timestamptz not null, valid_until timestamptz,
  created_at timestamptz not null default now(), unique(id,user_id),
  foreign key (scope_id,user_id) references public.scopes(id,user_id)
);
