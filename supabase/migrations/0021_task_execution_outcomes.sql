alter table public.tasks
  drop constraint tasks_status_check,
  add constraint tasks_status_check check (status in (
    'INBOX','PLANNED','IN_PROGRESS','BLOCKED','WAITING_FOR_USER',
    'DONE','CLOSED_PARTIAL','SKIPPED','CANCELLED'
  ));

comment on column public.tasks.status is
  'Canonical Task lifecycle. CLOSED_PARTIAL, SKIPPED, CANCELLED, and DONE are terminal outcomes.';

alter table public.task_learning_targets
  add column assigned_units integer check (assigned_units > 0),
  add column completed_units integer not null default 0 check (completed_units >= 0),
  add column completed_through_sequence integer,
  add column execution_status text not null default 'PENDING'
    check (execution_status in ('PENDING','COMPLETED','PARTIAL','SKIPPED','CANCELLED')),
  add column resolved_at timestamptz,
  add column recovery_mode text
    check (recovery_mode is null or recovery_mode in ('REDISTRIBUTE','RESET','CARRY_FORWARD','MANUAL')),
  add column materialization_key text
    check (materialization_key is null or length(trim(materialization_key)) > 0);

update public.task_learning_targets
set assigned_units=end_sequence-start_sequence+1
where start_sequence is not null and end_sequence is not null;

alter table public.task_learning_targets
  add constraint task_learning_targets_assigned_range_check check (
    start_sequence is null or end_sequence is null or assigned_units=end_sequence-start_sequence+1
  ),
  add constraint task_learning_targets_completed_count_check check (
    assigned_units is null or completed_units <= assigned_units
  ),
  add constraint task_learning_targets_completed_sequence_check check (
    completed_through_sequence is null or (
      start_sequence is not null
      and completed_through_sequence >= start_sequence
      and (end_sequence is null or completed_through_sequence <= end_sequence)
      and completed_through_sequence=start_sequence+completed_units-1
    )
  ),
  add constraint task_learning_targets_execution_result_check check (
    (execution_status='PENDING' and completed_units=0 and completed_through_sequence is null and resolved_at is null)
    or
    (execution_status='COMPLETED' and resolved_at is not null and assigned_units is not null
      and completed_units=assigned_units
      and ((start_sequence is null and completed_through_sequence is null)
        or (start_sequence is not null and end_sequence is not null and completed_through_sequence=end_sequence)))
    or
    (execution_status='PARTIAL' and resolved_at is not null and assigned_units is not null
      and completed_units>0 and completed_units<assigned_units
      and ((start_sequence is null and completed_through_sequence is null)
        or (start_sequence is not null and completed_through_sequence is not null)))
    or
    (execution_status in ('SKIPPED','CANCELLED') and resolved_at is not null
      and completed_units=0 and completed_through_sequence is null)
  );

create unique index task_learning_targets_materialization_key
  on public.task_learning_targets(user_id,materialization_key)
  where materialization_key is not null;

create index task_learning_targets_active_material_range
  on public.task_learning_targets(user_id,material_id,start_sequence,end_sequence)
  where execution_status='PENDING';

comment on column public.task_learning_targets.assigned_units is
  'Assigned quantity. For bounded sequential ranges this equals end_sequence-start_sequence+1.';
comment on column public.task_learning_targets.completed_units is
  'Actually performed quantity; never inferred from Task status alone.';
comment on column public.task_learning_targets.completed_through_sequence is
  'Inclusive contiguous completion from start_sequence; null for open-ended quantity work.';
comment on column public.task_learning_targets.execution_status is
  'Canonical assigned-scope execution result; PENDING is active and all other values are terminal.';
comment on column public.task_learning_targets.materialization_key is
  'Caller-scoped deterministic identity for idempotent Learning Task materialization.';
