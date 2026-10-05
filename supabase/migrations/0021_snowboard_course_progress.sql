-- Latest Snowboard lecture observation; independent of Lifehacker Learning Unit state.
create table public.snowboard_course_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id text not null,
  work_context_id uuid not null,
  completed_lecture_count integer not null check (completed_lecture_count >= 0),
  remaining_lecture_count integer not null check (remaining_lecture_count >= 0),
  remaining_lecture_minutes integer not null check (remaining_lecture_minutes >= 0),
  observed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id),
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade
);

create index snowboard_course_progress_user_context
  on public.snowboard_course_progress(user_id,work_context_id);

alter table public.snowboard_course_progress enable row level security;
create policy snowboard_course_progress_owner on public.snowboard_course_progress for all to authenticated
  using (auth.uid()=user_id) with check (auth.uid()=user_id);

comment on table public.snowboard_course_progress is
  'Latest external lecture observation; never implies Learning Unit exposure, understanding, or validation.';
