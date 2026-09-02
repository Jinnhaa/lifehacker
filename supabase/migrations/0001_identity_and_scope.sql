create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Seoul',
  locale text not null default 'ko-KR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  week_starts_on smallint not null default 1 check (week_starts_on between 1 and 7),
  planning_buffer_minutes integer not null default 0 check (planning_buffer_minutes >= 0),
  monthly_ai_budget_krw integer check (monthly_ai_budget_krw >= 0),
  planning_policy jsonb not null default '{}'::jsonb,
  notification_policy jsonb not null default '{}'::jsonb,
  wake_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('global','work_context','goal','objective','custom')),
  parent_scope_id uuid,
  label text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_scope_id, user_id) references public.scopes(id, user_id)
);

create unique index scopes_one_global_per_user on public.scopes(user_id) where kind = 'global';
