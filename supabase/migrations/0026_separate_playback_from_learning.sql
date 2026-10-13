comment on table public.snowboard_lecture_progress is
  'Latest source-owned Snowboard lecture playback observations. Completion does not prove actual study and must not mutate Learning Unit Exposure, Understanding, or Validation.';

comment on table public.learning_units is
  'User-grounded actual learning state for Course/Certification contexts. Snowboard playback alone must not mutate these states.';
