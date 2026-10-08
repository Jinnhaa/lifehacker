-- Authoritative Snowboard lecture-module observations. These are external evidence only.
create table public.snowboard_lecture_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id text not null,
  work_context_id uuid not null,
  module_id text not null,
  position integer not null check (position > 0),
  title text not null check (btrim(title) <> ''),
  completed boolean not null,
  estimated_minutes integer not null check (estimated_minutes >= 0),
  observed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id,course_id,module_id),
  foreign key (user_id,course_id) references public.snowboard_course_progress(user_id,course_id) on delete cascade,
  foreign key (work_context_id,user_id) references public.work_contexts(id,user_id) on delete cascade
);

create index snowboard_lecture_progress_user_context
  on public.snowboard_lecture_progress(user_id,work_context_id,position);

alter table public.snowboard_lecture_progress enable row level security;
create policy snowboard_lecture_progress_owner on public.snowboard_lecture_progress for all to authenticated
  using (auth.uid()=user_id) with check (auth.uid()=user_id);

comment on table public.snowboard_lecture_progress is
  'Latest external lecture-module observations. Completion may affect only mapped lecture-action Exposure, never other actions, Understanding, or Validation.';
comment on column public.snowboard_lecture_progress.module_id is
  'Stable Snowboard/Moodle course-module identity; position is ordering evidence only.';
