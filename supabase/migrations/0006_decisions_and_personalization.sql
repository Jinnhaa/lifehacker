create table public.decisions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_run_id uuid, question text not null, why_now text, options jsonb not null, ai_recommendation jsonb,
  ai_reason text, impact jsonb, status text not null, created_at timestamptz not null default now(), resolved_at timestamptz,
  unique(id,user_id)
);
create table public.decision_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  decision_id uuid not null, user_choice jsonb not null, user_reason text, corrected_ai_assumption text,
  created_at timestamptz not null default now(), unique(id,user_id), unique(decision_id),
  foreign key (decision_id,user_id) references public.decisions(id,user_id) on delete cascade
);
create table public.learning_cases (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  case_type text not null check (case_type in ('decision','planning','intervention','estimate','routine')),
  context_snapshot jsonb not null, recommendation_snapshot jsonb, decision_id uuid, decision_feedback_id uuid,
  status text not null, created_at timestamptz not null default now(), closed_at timestamptz,
  unique(id,user_id), foreign key (decision_id,user_id) references public.decisions(id,user_id),
  foreign key (decision_feedback_id,user_id) references public.decision_feedback(id,user_id)
);
create table public.learning_case_events (
  learning_case_id uuid not null, domain_event_id uuid not null,
  event_role text not null check (event_role in ('context','action','outcome')),
  primary key(learning_case_id,domain_event_id,event_role),
  foreign key (learning_case_id) references public.learning_cases(id) on delete cascade,
  foreign key (domain_event_id) references public.domain_events(id) on delete cascade
);
create table public.outcomes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  learning_case_id uuid not null, source_event_id uuid, outcome_type text not null, summary text, success boolean,
  score numeric, payload jsonb not null default '{}'::jsonb, observed_at timestamptz not null, created_at timestamptz not null default now(),
  unique(id,user_id), foreign key (learning_case_id,user_id) references public.learning_cases(id,user_id),
  foreign key (source_event_id,user_id) references public.domain_events(id,user_id)
);
create table public.patterns (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  pattern_type text not null, condition jsonb not null, observed_behavior text not null,
  confidence numeric not null check (confidence between 0 and 1), evidence_count integer not null check (evidence_count >= 0),
  evaluator_version text not null, status text not null check (status in ('candidate','active','dismissed','expired')),
  first_observed_at timestamptz not null, last_observed_at timestamptz not null, created_at timestamptz not null default now(),
  unique(id,user_id)
);
create table public.pattern_evidence (
  pattern_id uuid not null, learning_case_id uuid not null,
  direction text not null check (direction in ('supports','contradicts')), weight numeric not null, observed_at timestamptz not null,
  primary key(pattern_id,learning_case_id), foreign key(pattern_id) references public.patterns(id) on delete cascade,
  foreign key(learning_case_id) references public.learning_cases(id) on delete cascade
);
create table public.principles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid, source_pattern_id uuid, statement text not null, origin text not null, created_by text not null,
  confirmation_status text not null, source_reference jsonb, valid_from timestamptz not null, valid_until timestamptz,
  status text not null, approved_at timestamptz, created_at timestamptz not null default now(), unique(id,user_id),
  foreign key(scope_id,user_id) references public.scopes(id,user_id), foreign key(source_pattern_id,user_id) references public.patterns(id,user_id)
);
create table public.preferences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid, preference_key text not null, value jsonb not null, origin text not null, created_by text not null,
  confirmation_status text not null, source_reference jsonb, valid_from timestamptz not null, valid_until timestamptz,
  created_at timestamptz not null default now(), unique(id,user_id), foreign key(scope_id,user_id) references public.scopes(id,user_id)
);
create table public.memories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid, memory_type text not null check (memory_type in ('fact','decision','project','experience','growth','strategy')),
  title text, content text not null, summary text, importance smallint not null check (importance between 1 and 5),
  origin text not null, confirmation_status text not null,
  retention_class text not null check (retention_class in ('permanent','compressible','short')),
  source_reference jsonb, source_event_id uuid, created_at timestamptz not null default now(), archived_at timestamptz,
  unique(id,user_id), foreign key(scope_id,user_id) references public.scopes(id,user_id),
  foreign key(source_event_id,user_id) references public.domain_events(id,user_id)
);
