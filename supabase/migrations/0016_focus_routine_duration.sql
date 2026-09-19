-- A FocusSession belongs to exactly one executable Task or Routine occurrence.
alter table public.focus_sessions alter column task_id drop not null;
alter table public.focus_sessions
  add column activity_occurrence_id uuid,
  add column planned_minutes integer check (planned_minutes > 0),
  add column actual_seconds integer not null default 0 check (actual_seconds >= 0),
  add constraint focus_sessions_activity_occurrence_owner_fk
    foreign key (activity_occurrence_id,user_id) references public.activity_occurrences(id,user_id),
  add constraint focus_sessions_single_target_ck
    check ((task_id is not null and activity_occurrence_id is null)
      or (task_id is null and activity_occurrence_id is not null));

-- Preserve historical knowledge where the previous workflow checkpoint recorded it.
update public.focus_sessions f set planned_minutes=(w.checkpoint_state->>'durationMinutes')::integer
from public.workflow_runs w
where w.user_id=f.user_id and w.workflow_type='focus'
  and w.checkpoint_state->>'sessionId'=f.id::text
  and w.checkpoint_state->>'durationMinutes' ~ '^[0-9]+$'
  and (w.checkpoint_state->>'durationMinutes')::integer > 0;

update public.focus_sessions set actual_seconds=greatest(0,
  floor(extract(epoch from (coalesce(ended_at,paused_at)-started_at)))::integer)
where ended_at is not null or paused_at is not null;

create index focus_sessions_occurrence_idx
  on public.focus_sessions(user_id,activity_occurrence_id,started_at desc)
  where activity_occurrence_id is not null;
