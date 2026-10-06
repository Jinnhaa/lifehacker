alter table public.course_assessments
  add column scope_config jsonb
    check (scope_config is null or jsonb_typeof(scope_config)='object');

comment on column public.course_assessments.scope_config is
  'Validated University assessment scope. Invalid or absent input is unknown and must never be guessed.';

-- Append the field so existing learning_assessments view column positions remain stable.
create or replace view public.learning_assessments with (security_invoker=true) as
  select id,user_id,course_context_id as work_context_id,linked_task_id,assessment_type,title,
    weight_percent,due_at,score,max_score,submission_status,provenance,observed_at,created_at,updated_at,
    due_date,scope_config
  from public.course_assessments;

alter table public.task_learning_targets
  add column target_role text not null default 'EXECUTION_TARGET'
    check (target_role in ('EXECUTION_TARGET','RELATED_SCOPE','RECOMMENDED_READINESS'));

comment on column public.task_learning_targets.target_role is
  'Only EXECUTION_TARGET may mutate Learning evidence. RELATED_SCOPE and RECOMMENDED_READINESS are descriptive, non-blocking links.';
