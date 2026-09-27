alter table public.course_assessments
  add column due_date date,
  add constraint course_assessments_due_precision_check
    check (not (due_date is not null and due_at is not null));

comment on column public.course_assessments.due_date is
  'Authoritative date-only deadline when no exact time is known; mutually exclusive with due_at.';
comment on column public.course_assessments.due_at is
  'Authoritative exact deadline timestamp; never synthesized from a date-only fact.';

-- Append the new field so existing view column positions remain stable for legacy consumers.
create or replace view public.learning_assessments with (security_invoker=true) as
  select id,user_id,course_context_id as work_context_id,linked_task_id,assessment_type,title,
    weight_percent,due_at,score,max_score,submission_status,provenance,observed_at,created_at,updated_at,
    due_date
  from public.course_assessments;

create index course_assessments_user_context_due_date
  on public.course_assessments(user_id,course_context_id,due_date);
