alter table public.artifacts
  add column revision_of_artifact_id uuid,
  add foreign key(revision_of_artifact_id,user_id) references public.artifacts(id,user_id);

create index artifacts_revision_of on public.artifacts(user_id,revision_of_artifact_id);

alter table public.task_steps
  add column review_of_step_id uuid,
  add foreign key(review_of_step_id,user_id) references public.task_steps(id,user_id);
