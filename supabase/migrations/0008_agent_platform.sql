create table public.mcp_server_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  server_label text not null, transport text not null, server_url text, trust_level text not null, auth_secret_ref text,
  protocol_version text, capabilities jsonb not null default '{}'::jsonb, enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.agent_templates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  template_key text not null, version text not null, name text not null, role text not null, instructions text not null,
  active boolean not null default true, created_at timestamptz not null default now(), unique(id,user_id), unique(user_id,template_key,version)
);
create table public.agent_instances (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  agent_template_id uuid not null, template_version text not null, name text not null, home_scope_id uuid not null,
  custom_instructions text, status text not null, created_at timestamptz not null default now(), archived_at timestamptz,
  unique(id,user_id), foreign key(agent_template_id,user_id) references public.agent_templates(id,user_id),
  foreign key(home_scope_id,user_id) references public.scopes(id,user_id)
);
create table public.agent_scope_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  agent_instance_id uuid not null, scope_id uuid not null, access_level text not null, valid_from timestamptz not null, valid_until timestamptz,
  unique(id,user_id), unique(agent_instance_id,scope_id),
  foreign key(agent_instance_id,user_id) references public.agent_instances(id,user_id) on delete cascade,
  foreign key(scope_id,user_id) references public.scopes(id,user_id)
);
create table public.tool_definitions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  tool_key text not null, source_type text not null, read_only boolean not null, destructive boolean not null,
  idempotent boolean not null, open_world boolean not null, trust_level text not null, data_access_class text not null,
  side_effect_class text not null, default_approval_policy text not null, version text not null,
  mcp_server_connection_id uuid, active boolean not null default true, created_at timestamptz not null default now(),
  unique(id,user_id), unique(user_id,tool_key,version),
  foreign key(mcp_server_connection_id,user_id) references public.mcp_server_connections(id,user_id)
);
create table public.tool_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  agent_instance_id uuid not null, tool_definition_id uuid not null, scope_id uuid,
  permission text not null check(permission in ('allow','deny')), approval_policy text not null,
  valid_from timestamptz not null, valid_until timestamptz, unique(id,user_id),
  foreign key(agent_instance_id,user_id) references public.agent_instances(id,user_id) on delete cascade,
  foreign key(tool_definition_id,user_id) references public.tool_definitions(id,user_id),
  foreign key(scope_id,user_id) references public.scopes(id,user_id)
);
create table public.context_packages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid not null, task_id uuid, work_context_id uuid, payload jsonb not null, source_refs jsonb not null,
  policy_version text not null, retention_expires_at timestamptz, created_at timestamptz not null default now(), unique(id,user_id),
  foreign key(scope_id,user_id) references public.scopes(id,user_id), foreign key(task_id,user_id) references public.tasks(id,user_id),
  foreign key(work_context_id,user_id) references public.work_contexts(id,user_id)
);
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  agent_instance_id uuid not null, workflow_run_id uuid, context_package_id uuid, template_version text not null,
  policy_version text not null, status text not null, max_turns integer not null check(max_turns > 0),
  max_tool_calls integer not null check(max_tool_calls >= 0), cost_budget_krw integer check(cost_budget_krw >= 0),
  started_at timestamptz not null, ended_at timestamptz, created_at timestamptz not null default now(), unique(id,user_id),
  foreign key(agent_instance_id,user_id) references public.agent_instances(id,user_id),
  foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id),
  foreign key(context_package_id,user_id) references public.context_packages(id,user_id)
);
create table public.ai_executions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  agent_run_id uuid, workflow_run_id uuid, job_type text not null, provider text not null, model text not null,
  prompt_version text, input_context_hash text not null, status text not null, input_tokens integer check(input_tokens >= 0),
  output_tokens integer check(output_tokens >= 0), estimated_cost_usd numeric check(estimated_cost_usd >= 0),
  estimated_cost_krw numeric check(estimated_cost_krw >= 0), fx_rate_snapshot numeric check(fx_rate_snapshot > 0),
  latency_ms integer check(latency_ms >= 0), created_at timestamptz not null default now(), completed_at timestamptz,
  unique(id,user_id), foreign key(agent_run_id,user_id) references public.agent_runs(id,user_id),
  foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id)
);
create table public.tool_calls (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  agent_run_id uuid, workflow_run_id uuid, tool_definition_id uuid not null, scope_id uuid, approval_request_id uuid,
  input_hash text not null, status text not null, result_ref text, latency_ms integer check(latency_ms >= 0), error text,
  created_at timestamptz not null default now(), completed_at timestamptz, unique(id,user_id),
  foreign key(agent_run_id,user_id) references public.agent_runs(id,user_id), foreign key(workflow_run_id,user_id) references public.workflow_runs(id,user_id),
  foreign key(tool_definition_id,user_id) references public.tool_definitions(id,user_id), foreign key(scope_id,user_id) references public.scopes(id,user_id),
  foreign key(approval_request_id,user_id) references public.approval_requests(id,user_id)
);
create table public.artifacts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  artifact_type text not null, title text, task_id uuid, work_context_id uuid, source_ai_execution_id uuid, source_agent_run_id uuid,
  content_text text, storage_path text, content_hash text, created_at timestamptz not null default now(), unique(id,user_id),
  foreign key(task_id,user_id) references public.tasks(id,user_id), foreign key(work_context_id,user_id) references public.work_contexts(id,user_id),
  foreign key(source_ai_execution_id,user_id) references public.ai_executions(id,user_id),
  foreign key(source_agent_run_id,user_id) references public.agent_runs(id,user_id),
  check(content_text is not null or storage_path is not null)
);
