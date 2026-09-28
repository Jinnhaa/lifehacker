-- Chief P0 v0.1: user-owned context strategy and explicit learning/progress evidence.
alter table public.work_contexts
  drop constraint work_contexts_kind_check,
  drop constraint work_contexts_check,
  add constraint work_contexts_kind_check
    check (kind in ('project','course','certification')),
  add constraint work_contexts_check
    check ((kind in ('course','certification') and agent_mode='not_applicable') or kind='project'),
  add column strategic_importance smallint check (strategic_importance between 1 and 5),
  add column commitment_level text check (commitment_level in ('REQUIRED','IMPORTANT','OPTIONAL')),
  add column internal_start_date date,
  add column strategy_config jsonb not null default '{}'::jsonb;

comment on column public.work_contexts.strategic_importance is
  'User-declared strategic importance; null means unset, not a derived current priority.';
comment on column public.work_contexts.internal_start_date is
  'Internal operating start date, distinct from official/external start_date.';
comment on column public.work_contexts.strategy_config is
  'Context-type-specific strategy options only; canonical common fields belong in columns.';

create table public.certification_profiles (
  work_context_id uuid primary key,
  user_id uuid not null,
  target_outcome text,
  exam_date date,
  study_mode text check (study_mode in ('CUMULATIVE','MIXED','CRAMMABLE')),
  current_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade
);

comment on table public.certification_profiles is
  'Certification context profile; context kind is a domain contract, not enforced by a cross-table trigger.';
comment on column public.certification_profiles.exam_date is
  'Planning anchor date; does not replace the authoritative Calendar fixed-time event.';

create table public.learning_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  work_context_id uuid not null,
  title text not null,
  position integer not null check (position > 0),
  exposure_state text not null default 'NOT_STARTED'
    check (exposure_state in ('NOT_STARTED','PARTIAL','COMPLETE')),
  understanding_state text not null default 'UNKNOWN'
    check (understanding_state in ('UNKNOWN','WEAK','OK','STRONG')),
  validation_state text not null default 'NOT_TESTED'
    check (validation_state in ('NOT_TESTED','FAILED','PASSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_context_id,position),
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade
);

comment on table public.learning_units is
  'User-grounded learning state for Course/Certification contexts; playback alone must not mutate learning states.';

alter table public.objectives
  add column progress_mode text not null default 'STATUS'
    check (progress_mode in ('STATUS','TASK_COUNT','NUMERIC')),
  add column target_value numeric check (target_value > 0),
  add column current_value numeric check (current_value >= 0),
  add column unit text;

comment on column public.objectives.progress_mode is
  'STATUS: explicit milestone/state; TASK_COUNT: explicitly defined child Task completion; NUMERIC: explicit measurable value. Never estimated minutes.';

alter table public.tasks add column scope_exclusions text;
comment on column public.tasks.scope_exclusions is
  'Explicit work outside the current Task/session scope; completion uses existing completion_criteria.';

create index learning_units_user_context_position
  on public.learning_units(user_id,work_context_id,position);

alter table public.certification_profiles enable row level security;
create policy certification_profiles_owner on public.certification_profiles for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);

alter table public.learning_units enable row level security;
create policy learning_units_owner on public.learning_units for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);
