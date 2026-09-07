create table public.workstyle_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check(scope_type in ('global','agent')),
  agent_type text check(agent_type in ('chief','project_pm','research','development')),
  revision integer not null check(revision > 0),
  instructions text[] not null default '{}',
  directives jsonb not null default '{}'::jsonb check(jsonb_typeof(directives) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id),
  check((scope_type='global' and agent_type is null) or (scope_type='agent' and agent_type is not null))
);

create unique index workstyle_profiles_active_global
  on public.workstyle_profiles(user_id) where active and scope_type='global';
create unique index workstyle_profiles_active_agent
  on public.workstyle_profiles(user_id,agent_type) where active and scope_type='agent';
create unique index workstyle_profiles_revision
  on public.workstyle_profiles(user_id,scope_type,coalesce(agent_type,''),revision);

alter table public.workstyle_profiles enable row level security;
create policy workstyle_profiles_owner on public.workstyle_profiles for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);

