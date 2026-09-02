create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_type text not null, status text not null, current_step text, checkpoint_state jsonb not null default '{}'::jsonb,
  checkpoint_version integer not null check(checkpoint_version >= 0), idempotency_key text not null, correlation_id uuid not null,
  started_at timestamptz not null, updated_at timestamptz not null default now(), completed_at timestamptz,
  unique(id,user_id), unique(user_id,idempotency_key)
);
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_run_id uuid not null, decision_id uuid, action_type text not null, action_ref text not null, action_hash text not null,
  checkpoint_version integer not null, status text not null, requested_at timestamptz not null, expires_at timestamptz,
  responded_at timestamptz, responded_by text, response_payload jsonb, resume_idempotency_key text not null,
  created_at timestamptz not null default now(), unique(id,user_id), unique(user_id,resume_idempotency_key),
  foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id),
  foreign key(decision_id,user_id) references public.decisions(id,user_id)
);
create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_run_id uuid, job_key text not null, job_type text not null, run_at timestamptz not null, payload jsonb not null,
  status text not null, attempt_count integer not null default 0 check(attempt_count >= 0), max_attempts integer not null check(max_attempts > 0),
  last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,user_id), unique(user_id,job_key), foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_run_id uuid, channel text not null, notification_type text not null, priority text not null, payload jsonb not null,
  scheduled_at timestamptz, status text not null check(status in ('scheduled','suppressed','sent','delivered','acknowledged','failed','cancelled')),
  suppression_reason text, attempt_no integer not null default 1 check(attempt_no > 0), dedupe_key text not null,
  sent_at timestamptz, delivered_at timestamptz, acknowledged_at timestamptz, created_at timestamptz not null default now(),
  unique(id,user_id), unique(user_id,dedupe_key), foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id),
  check ((status='suppressed' and suppression_reason is not null) or status<>'suppressed')
);
create table public.outbox_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null, payload jsonb not null, idempotency_key text not null, status text not null,
  available_at timestamptz not null, attempt_count integer not null default 0 check(attempt_count >= 0),
  max_attempts integer not null check(max_attempts > 0), last_error text, created_at timestamptz not null default now(), processed_at timestamptz,
  unique(id,user_id), unique(user_id,idempotency_key)
);

alter table public.decisions add constraint decisions_workflow_user_fk foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id);
alter table public.domain_events add constraint domain_events_workflow_user_fk foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id);
