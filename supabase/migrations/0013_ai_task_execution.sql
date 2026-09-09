alter table public.task_steps add column skill_key text;

alter table public.context_packages
  add column task_step_id uuid,
  add foreign key(task_step_id,user_id) references public.task_steps(id,user_id);

alter table public.agent_runs
  add column task_step_id uuid,
  add column skill_key text,
  add column skill_version text,
  add column attempt_number integer check(attempt_number > 0),
  add column execution_key text,
  add column idempotency_key text,
  add column failure_code text,
  add column failure_reason text,
  add foreign key(task_step_id,user_id) references public.task_steps(id,user_id),
  add unique(user_id,execution_key,attempt_number),
  add unique(user_id,idempotency_key);

alter table public.artifacts
  add column task_step_id uuid,
  add column schema_version text,
  add column verification_status text check(verification_status in ('verified')),
  add column review_status text check(review_status in ('pending_review','accepted','rejected')),
  add column source_refs jsonb,
  add foreign key(task_step_id,user_id) references public.task_steps(id,user_id);

create index task_steps_ai_dispatch on public.task_steps(user_id,status,owner) where owner='ai';
create index agent_runs_execution on public.agent_runs(user_id,execution_key,attempt_number);
create index artifacts_task_step_review on public.artifacts(user_id,task_step_id,review_status);
