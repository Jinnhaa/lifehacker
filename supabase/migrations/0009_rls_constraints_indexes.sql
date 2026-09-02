create or replace function public.enforce_course_context() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from work_contexts w
    where w.id = coalesce((to_jsonb(new)->>'work_context_id')::uuid,(to_jsonb(new)->>'course_context_id')::uuid)
      and w.user_id=new.user_id and w.kind='course') then
    raise exception 'course extension requires a course WorkContext';
  end if;
  return new;
end $$;
create trigger course_profiles_course_only before insert or update on public.course_profiles for each row execute function public.enforce_course_context();
create trigger course_assessments_course_only before insert or update on public.course_assessments for each row execute function public.enforce_course_context();

create or replace function public.enforce_task_objective_context() returns trigger language plpgsql set search_path = public as $$
declare objective_context uuid;
begin
  if new.objective_id is not null then
    select work_context_id into objective_context from objectives where id=new.objective_id and user_id=new.user_id;
    if objective_context is not null and new.work_context_id is not null and objective_context <> new.work_context_id then
      raise exception 'Task and Objective WorkContext mismatch';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_objective_context before insert or update of objective_id,work_context_id,user_id on public.tasks for each row execute function public.enforce_task_objective_context();

create or replace function public.prevent_objective_context_mismatch() returns trigger language plpgsql set search_path = public as $$
begin
  if exists(select 1 from tasks t where t.objective_id=new.id and t.user_id=new.user_id
    and t.work_context_id is not null and new.work_context_id is not null and t.work_context_id<>new.work_context_id) then
    raise exception 'Objective WorkContext change would mismatch an existing Task';
  end if;
  return new;
end $$;
create trigger objectives_task_context before update of work_context_id,user_id on public.objectives for each row execute function public.prevent_objective_context_mismatch();

create or replace function public.prevent_course_context_demotion() returns trigger language plpgsql set search_path = public as $$
begin
  if old.kind='course' and new.kind<>'course' and
    (exists(select 1 from course_profiles c where c.work_context_id=old.id) or
     exists(select 1 from course_assessments a where a.course_context_id=old.id)) then
    raise exception 'WorkContext with course extensions must remain a course';
  end if;
  return new;
end $$;
create trigger work_contexts_course_extensions before update of kind on public.work_contexts for each row execute function public.prevent_course_context_demotion();

create or replace function public.enforce_learning_case_feedback() returns trigger language plpgsql set search_path = public as $$
declare feedback_decision uuid;
begin
  if new.decision_feedback_id is not null then
    select decision_id into feedback_decision from decision_feedback where id=new.decision_feedback_id and user_id=new.user_id;
    if new.decision_id is null or feedback_decision is distinct from new.decision_id then
      raise exception 'LearningCase feedback must belong to its Decision';
    end if;
  end if;
  return new;
end $$;
create trigger learning_cases_feedback_consistency before insert or update of decision_id,decision_feedback_id,user_id on public.learning_cases for each row execute function public.enforce_learning_case_feedback();

create or replace function public.prevent_feedback_decision_mismatch() returns trigger language plpgsql set search_path = public as $$
begin
  if exists(select 1 from learning_cases l where l.decision_feedback_id=new.id
    and (l.user_id<>new.user_id or l.decision_id is distinct from new.decision_id)) then
    raise exception 'DecisionFeedback change would mismatch an existing LearningCase';
  end if;
  return new;
end $$;
create trigger decision_feedback_learning_case before update of decision_id,user_id on public.decision_feedback for each row execute function public.prevent_feedback_decision_mismatch();

create or replace function public.enforce_learning_link_owner() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name='learning_case_events' and not exists (
    select 1 from learning_cases l join domain_events e on e.id=new.domain_event_id
    where l.id=new.learning_case_id and l.user_id=e.user_id) then raise exception 'LearningCase event owner mismatch'; end if;
  if tg_table_name='pattern_evidence' and not exists (
    select 1 from patterns p join learning_cases l on l.id=new.learning_case_id
    where p.id=new.pattern_id and p.user_id=l.user_id) then raise exception 'Pattern evidence owner mismatch'; end if;
  return new;
end $$;
create trigger learning_case_events_owner before insert or update on public.learning_case_events for each row execute function public.enforce_learning_link_owner();
create trigger pattern_evidence_owner before insert or update on public.pattern_evidence for each row execute function public.enforce_learning_link_owner();

create or replace function public.prevent_approved_plan_structure_change() returns trigger language plpgsql set search_path = public as $$
declare plan_status text;
begin
  if tg_op='DELETE' then select status into plan_status from daily_plans where id=old.daily_plan_id; else select status into plan_status from daily_plans where id=new.daily_plan_id; end if;
  if plan_status='approved' and (tg_op<>'UPDATE' or row(new.position,new.item_type,new.task_id,new.activity_occurrence_id,new.planned_start_at,new.planned_end_at,new.planned_minutes)
      is distinct from row(old.position,old.item_type,old.task_id,old.activity_occurrence_id,old.planned_start_at,old.planned_end_at,old.planned_minutes)) then
    raise exception 'approved plan schedule is immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger plan_items_approved_immutable before insert or update or delete on public.plan_items for each row execute function public.prevent_approved_plan_structure_change();

create or replace function public.approval_is_resumable(p_approval_id uuid,p_action_hash text,p_checkpoint_version integer)
returns boolean language sql stable security invoker set search_path=public as $$
  select exists(select 1 from approval_requests a join workflow_runs w on w.id=a.workflow_run_id and w.user_id=a.user_id
    where a.id=p_approval_id and a.status='approved' and (a.expires_at is null or a.expires_at>now())
      and a.action_hash=p_action_hash and a.checkpoint_version=p_checkpoint_version and w.checkpoint_version=p_checkpoint_version)
$$;

create or replace function public.effective_tool_permission(p_agent_instance_id uuid,p_tool_definition_id uuid,p_scope_id uuid)
returns text language sql stable security invoker set search_path=public as $$
  select case when exists(select 1 from tool_grants g where g.agent_instance_id=p_agent_instance_id and g.tool_definition_id=p_tool_definition_id
      and (g.scope_id is null or g.scope_id=p_scope_id) and g.permission='deny' and g.valid_from<=now() and (g.valid_until is null or g.valid_until>now())) then 'deny'
    when exists(select 1 from tool_grants g where g.agent_instance_id=p_agent_instance_id and g.tool_definition_id=p_tool_definition_id
      and (g.scope_id is null or g.scope_id=p_scope_id) and g.permission='allow' and g.valid_from<=now() and (g.valid_until is null or g.valid_until>now())) then 'allow'
    else 'deny' end
$$;

create unique index daily_plans_one_approved on public.daily_plans(user_id,plan_date) where status='approved';
create unique index focus_sessions_one_active on public.focus_sessions(user_id) where status='active';
create index tasks_user_status on public.tasks(user_id,status);
create index tasks_user_deadline on public.tasks(user_id,official_deadline);
create index tasks_user_context_status on public.tasks(user_id,work_context_id,status);
create index daily_plans_user_date on public.daily_plans(user_id,plan_date);
create index recurring_activities_user_active on public.recurring_activities(user_id,active);
create index activity_occurrences_period on public.activity_occurrences(recurring_activity_id,period_key);
create index domain_events_user_occurred on public.domain_events(user_id,occurred_at desc);
create index domain_events_aggregate on public.domain_events(user_id,aggregate_type,aggregate_id,occurred_at desc);
create index domain_events_correlation on public.domain_events(correlation_id);
create index domain_events_workflow on public.domain_events(workflow_run_id);
create index inbox_items_parse on public.inbox_items(user_id,parse_status);
create index inbox_items_received on public.inbox_items(user_id,received_at desc);
create index external_references_sync on public.external_references(user_id,source,sync_status);
create index patterns_status_type on public.patterns(user_id,status,pattern_type);
create index memories_type_created on public.memories(user_id,memory_type,created_at desc);
create index workflow_runs_status_updated on public.workflow_runs(user_id,status,updated_at);
create index ai_executions_user_created on public.ai_executions(user_id,created_at desc);
create index ai_executions_agent_run on public.ai_executions(agent_run_id);

do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','scopes','goals','objectives','work_contexts','course_profiles','course_assessments',
    'recurring_activities','activity_occurrences','tasks','task_steps','estimate_revisions','constraints','strategic_directives',
    'daily_plans','plan_items','focus_sessions','domain_events','inbox_items','parsed_entities','domain_commands',
    'external_references','integration_accounts','decisions','decision_feedback','learning_cases','outcomes','patterns',
    'principles','preferences','memories','workflow_runs','approval_requests','scheduled_jobs','notifications','outbox_events',
    'agent_templates','agent_instances','agent_scope_grants','tool_definitions','tool_grants','context_packages','agent_runs',
    'ai_executions','tool_calls','artifacts','mcp_server_connections'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t||'_owner',t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all to authenticated using(auth.uid()=id) with check(auth.uid()=id);
alter table public.learning_case_events enable row level security;
create policy learning_case_events_owner_policy on public.learning_case_events for all to authenticated
using(exists(select 1 from public.learning_cases l where l.id=learning_case_id and l.user_id=auth.uid()))
with check(exists(select 1 from public.learning_cases l where l.id=learning_case_id and l.user_id=auth.uid()));
alter table public.pattern_evidence enable row level security;
create policy pattern_evidence_owner_policy on public.pattern_evidence for all to authenticated
using(exists(select 1 from public.patterns p where p.id=pattern_id and p.user_id=auth.uid()))
with check(exists(select 1 from public.patterns p where p.id=pattern_id and p.user_id=auth.uid()));
