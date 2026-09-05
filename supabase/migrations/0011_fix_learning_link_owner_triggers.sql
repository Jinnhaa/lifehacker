drop trigger if exists learning_case_events_owner on public.learning_case_events;
drop trigger if exists pattern_evidence_owner on public.pattern_evidence;
drop function if exists public.enforce_learning_link_owner();

create function public.enforce_learning_case_event_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1
    from public.learning_cases l
    join public.domain_events e on e.id = new.domain_event_id
    where l.id = new.learning_case_id and l.user_id = e.user_id
  ) then
    raise exception 'LearningCase event owner mismatch';
  end if;
  return new;
end $$;

create trigger learning_case_events_owner
before insert or update on public.learning_case_events
for each row execute function public.enforce_learning_case_event_owner();

create function public.enforce_pattern_evidence_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1
    from public.patterns p
    join public.learning_cases l on l.id = new.learning_case_id
    where p.id = new.pattern_id and p.user_id = l.user_id
  ) then
    raise exception 'Pattern evidence owner mismatch';
  end if;
  return new;
end $$;

create trigger pattern_evidence_owner
before insert or update on public.pattern_evidence
for each row execute function public.enforce_pattern_evidence_owner();
