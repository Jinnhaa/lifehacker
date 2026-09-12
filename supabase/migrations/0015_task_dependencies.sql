-- Explicit cross-task prerequisites; ordered TaskSteps remain unchanged.
create table public.task_dependencies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  prerequisite_task_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id,task_id,prerequisite_task_id),
  check(task_id <> prerequisite_task_id),
  foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade,
  foreign key(prerequisite_task_id,user_id) references public.tasks(id,user_id) on delete cascade
);
create index task_dependencies_prerequisite on public.task_dependencies(user_id,prerequisite_task_id);
alter table public.task_dependencies enable row level security;
create policy task_dependencies_owner on public.task_dependencies for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);
