-- Learning V2 contract only. No allocation, completion, or forecasting runtime.
create table public.learning_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_context_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  position integer not null check (position > 0),
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED','ACTIVE','COMPLETED','ARCHIVED')),
  completion_mode text not null default 'MANUAL'
    check (completion_mode in ('MANUAL','ALL_REQUIRED_MATERIALS','ASSESSMENT_THRESHOLD')),
  transition_mode text not null default 'SEQUENTIAL'
    check (transition_mode in ('MANUAL','SEQUENTIAL','PARALLEL')),
  target_start_date date, target_end_date date,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), unique (id,user_id,work_context_id),
  unique (work_context_id,position),
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade,
  check (target_end_date is null or target_start_date is null or target_end_date >= target_start_date)
);

create table public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_context_id uuid not null, stage_id uuid,
  title text not null check (length(trim(title)) > 0),
  material_type text not null check (length(trim(material_type)) > 0),
  role text check (role is null or length(trim(role)) > 0),
  tracking_mode text not null default 'UNIT_COUNT'
    check (tracking_mode in ('UNIT_COUNT','LEARNING_STATE','TIME','UNTRACKED')),
  unit_type text check (unit_type is null or length(trim(unit_type)) > 0),
  total_units numeric check (total_units > 0),
  start_unit numeric check (start_unit > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','ARCHIVED')),
  source_reference jsonb check (source_reference is null or jsonb_typeof(source_reference)='object'),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), unique (id,user_id,work_context_id),
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade,
  foreign key (stage_id,user_id,work_context_id) references public.learning_stages(id,user_id,work_context_id),
  check (total_units is null or start_unit is null or start_unit <= total_units)
);
comment on column public.learning_materials.total_units is 'Null for open-ended materials; never fabricate a total.';
comment on column public.learning_materials.material_type is 'Data-defined category (book, app, slides, video, etc.); not a context-specific enum.';
comment on column public.learning_materials.role is 'Data-defined material role; required/optional completion membership may be configured per stage.';
comment on column public.learning_materials.tracking_mode is 'Tracking evidence only; TIME or exposure never implies understanding, validation, or semantic completion.';

alter table public.learning_units
  add column stage_id uuid,
  add column material_id uuid,
  add column sequence_no integer check (sequence_no > 0),
  add column unit_type text check (unit_type is null or length(trim(unit_type)) > 0),
  add column canonical_topic_key text check (canonical_topic_key is null or length(trim(canonical_topic_key)) > 0),
  add constraint learning_units_id_user_unique unique (id,user_id),
  add constraint learning_units_id_user_context_unique unique (id,user_id,work_context_id),
  add constraint learning_units_id_user_material_unique unique (id,user_id,material_id),
  add constraint learning_units_stage_context_fk foreign key (stage_id,user_id,work_context_id)
    references public.learning_stages(id,user_id,work_context_id),
  add constraint learning_units_material_context_fk foreign key (material_id,user_id,work_context_id)
    references public.learning_materials(id,user_id,work_context_id);
-- 0018 position remains the context-wide stable display order; sequence_no is material-local.
create unique index learning_units_material_sequence on public.learning_units(user_id,material_id,sequence_no)
  where material_id is not null and sequence_no is not null;

create table public.learning_allocation_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_context_id uuid not null, stage_id uuid,
  name text not null check (length(trim(name)) > 0),
  profile_type text not null check (length(trim(profile_type)) > 0),
  activation_condition jsonb not null default '{}'::jsonb check (jsonb_typeof(activation_condition)='object'),
  recovery_mode text not null default 'MANUAL'
    check (recovery_mode in ('REDISTRIBUTE','RESET','CARRY_FORWARD','MANUAL')),
  priority integer not null default 0 check (priority >= 0),
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade,
  foreign key (stage_id,user_id,work_context_id) references public.learning_stages(id,user_id,work_context_id)
);
comment on column public.learning_allocation_policies.profile_type is 'Data-defined profile such as normal, busy-day, or state-triggered; no runtime evaluator in this migration.';

create table public.learning_allocation_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  allocation_policy_id uuid not null, material_id uuid not null,
  target_units numeric not null check (target_units > 0),
  minimum_units numeric check (minimum_units >= 0 and minimum_units <= target_units),
  estimated_minutes_min integer check (estimated_minutes_min >= 0),
  estimated_minutes_max integer check (estimated_minutes_max >= 0),
  position integer not null check (position > 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), unique (allocation_policy_id,position),
  foreign key (allocation_policy_id,user_id) references public.learning_allocation_policies(id,user_id) on delete cascade,
  foreign key (material_id,user_id) references public.learning_materials(id,user_id),
  check (estimated_minutes_min is null or estimated_minutes_max is null or estimated_minutes_max >= estimated_minutes_min)
);

create table public.context_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_context_id uuid not null, to_context_id uuid not null,
  relation_type text not null check (length(trim(relation_type)) > 0),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), unique (user_id,from_context_id,to_context_id,relation_type),
  foreign key (from_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade,
  foreign key (to_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade,
  check (from_context_id <> to_context_id)
);
comment on column public.context_relations.relation_type is 'Data-defined relation such as LEARNING_SYNERGY; no topic ontology or derived priority.';

create table public.task_learning_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null, material_id uuid, learning_unit_id uuid,
  start_sequence integer check (start_sequence > 0), end_sequence integer check (end_sequence > 0),
  allocation_policy_id uuid,
  created_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (task_id,user_id) references public.tasks(id,user_id) on delete cascade,
  foreign key (material_id,user_id) references public.learning_materials(id,user_id),
  foreign key (learning_unit_id,user_id) references public.learning_units(id,user_id),
  foreign key (learning_unit_id,user_id,material_id) references public.learning_units(id,user_id,material_id),
  foreign key (allocation_policy_id,user_id) references public.learning_allocation_policies(id,user_id),
  check (material_id is not null or learning_unit_id is not null),
  check (end_sequence is null or start_sequence is not null),
  check (end_sequence is null or end_sequence >= start_sequence),
  check (start_sequence is null or material_id is not null)
);
comment on table public.task_learning_targets is 'Exact learning work/ranges linked to existing Tasks; future partial completion uses existing event history, not inferred learning state.';

-- Retain the existing assessment storage/name for all legacy callers and records.
alter table public.course_assessments
  drop constraint course_assessments_assessment_type_check,
  add constraint course_assessments_assessment_type_check
    check (assessment_type in ('quiz','midterm','final','assignment','project','team_project','exam','mock_exam','attendance','other'));
drop trigger course_assessments_course_only on public.course_assessments;
create function public.enforce_learning_context() returns trigger language plpgsql set search_path=public as $$
declare context_id uuid;
begin
  context_id := coalesce((to_jsonb(new)->>'work_context_id')::uuid,(to_jsonb(new)->>'course_context_id')::uuid);
  if not exists(select 1 from work_contexts where id=context_id and user_id=new.user_id and kind in ('course','certification')) then
    raise exception 'Learning data requires a Course or Certification WorkContext';
  end if;
  return new;
end $$;
create trigger course_assessments_learning_context before insert or update on public.course_assessments
  for each row execute function public.enforce_learning_context();
create trigger learning_stages_learning_context before insert or update on public.learning_stages
  for each row execute function public.enforce_learning_context();
create trigger learning_materials_learning_context before insert or update on public.learning_materials
  for each row execute function public.enforce_learning_context();
create trigger learning_units_learning_context before insert or update on public.learning_units
  for each row execute function public.enforce_learning_context();
create trigger learning_allocation_policies_learning_context before insert or update on public.learning_allocation_policies
  for each row execute function public.enforce_learning_context();

-- Ownership FKs above also require related learning work to stay in the same Context.
create function public.enforce_learning_allocation_context() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (
    select 1 from learning_allocation_policies p join learning_materials m
      on m.user_id=p.user_id and m.work_context_id=p.work_context_id
    where p.id=new.allocation_policy_id and p.user_id=new.user_id and m.id=new.material_id
  ) then
    raise exception 'Allocation policy and material must belong to the same Learning Context';
  end if;
  return new;
end $$;
create trigger learning_allocation_items_context before insert or update on public.learning_allocation_items
  for each row execute function public.enforce_learning_allocation_context();

-- Protect existing links when their parent rows are edited as well as on item insertion.
create function public.prevent_learning_allocation_context_mismatch() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='learning_materials' then
    if exists(select 1 from learning_allocation_items i join learning_allocation_policies p
      on p.id=i.allocation_policy_id and p.user_id=i.user_id
      where i.material_id=old.id and i.user_id=old.user_id
        and (p.work_context_id<>new.work_context_id or p.user_id<>new.user_id)) then
      raise exception 'Material Context change would mismatch an allocation policy';
    end if;
  else
    if exists(select 1 from learning_allocation_items i join learning_materials m
      on m.id=i.material_id and m.user_id=i.user_id
      where i.allocation_policy_id=old.id and i.user_id=old.user_id
        and (m.work_context_id<>new.work_context_id or m.user_id<>new.user_id)) then
      raise exception 'Policy Context change would mismatch an allocation material';
    end if;
  end if;
  return new;
end $$;
create trigger learning_materials_allocation_context before update of work_context_id,user_id on public.learning_materials
  for each row execute function public.prevent_learning_allocation_context_mismatch();
create trigger learning_policies_allocation_context before update of work_context_id,user_id on public.learning_allocation_policies
  for each row execute function public.prevent_learning_allocation_context_mismatch();

-- The old demotion guard assumed every assessment belonged only to a Course.
-- Keep the CourseProfile restriction while allowing assessments on either Learning kind.
create or replace function public.prevent_course_context_demotion() returns trigger language plpgsql set search_path=public as $$
begin
  if old.kind='course' and new.kind<>'course'
    and exists(select 1 from course_profiles c where c.work_context_id=old.id and c.user_id=old.user_id) then
    raise exception 'WorkContext with a CourseProfile must remain a Course';
  end if;
  if new.kind not in ('course','certification') and (
    exists(select 1 from course_assessments a where a.course_context_id=old.id and a.user_id=old.user_id) or
    exists(select 1 from learning_units u where u.work_context_id=old.id and u.user_id=old.user_id) or
    exists(select 1 from learning_stages s where s.work_context_id=old.id and s.user_id=old.user_id) or
    exists(select 1 from learning_materials m where m.work_context_id=old.id and m.user_id=old.user_id) or
    exists(select 1 from learning_allocation_policies p where p.work_context_id=old.id and p.user_id=old.user_id)
  ) then
    raise exception 'WorkContext with Learning data must remain a Learning Context';
  end if;
  return new;
end $$;

-- Simple updatable view: one storage system, a generic Context name, and underlying owner RLS.
create view public.learning_assessments with (security_invoker=true) as
  select id,user_id,course_context_id as work_context_id,linked_task_id,assessment_type,title,
    weight_percent,due_at,score,max_score,submission_status,provenance,observed_at,created_at,updated_at
  from public.course_assessments;
comment on view public.learning_assessments is 'Generic Course/Certification assessment contract over existing course_assessments storage; legacy callers remain compatible.';

create index learning_materials_user_context_stage on public.learning_materials(user_id,work_context_id,stage_id);
create index learning_units_user_stage on public.learning_units(user_id,stage_id) where stage_id is not null;
create index learning_allocation_policies_user_context on public.learning_allocation_policies(user_id,work_context_id,stage_id);
create index learning_allocation_items_user_material on public.learning_allocation_items(user_id,material_id);
create index context_relations_user_to on public.context_relations(user_id,to_context_id);
create index task_learning_targets_user_task on public.task_learning_targets(user_id,task_id);
create index course_assessments_user_context_due on public.course_assessments(user_id,course_context_id,due_at);

do $$
declare t text;
begin
  foreach t in array array['learning_stages','learning_materials','learning_allocation_policies',
    'learning_allocation_items','context_relations','task_learning_targets'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id)',t||'_owner',t);
  end loop;
end $$;
