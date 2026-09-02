create table public.inbox_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null, external_id text, external_version text, raw_content text, raw_payload jsonb, content_hash text,
  received_at timestamptz not null, observed_at timestamptz, dedupe_key text not null, provenance text not null,
  parse_status text not null, correlation_id uuid not null, created_at timestamptz not null default now(),
  unique(id,user_id), unique(user_id,dedupe_key)
);

create table public.domain_commands (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  command_type text not null, payload jsonb not null, idempotency_key text not null, correlation_id uuid not null,
  causation_id uuid, status text not null, result_entity_type text, result_entity_id uuid,
  created_at timestamptz not null default now(), applied_at timestamptz,
  unique(id,user_id), unique(user_id,idempotency_key)
);

create table public.parsed_entities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  inbox_item_id uuid not null, entity_type text not null, structured_data jsonb not null,
  confidence numeric not null check (confidence between 0 and 1), requires_confirmation boolean not null,
  processing_status text not null, domain_command_id uuid, created_at timestamptz not null default now(),
  unique(id,user_id), foreign key (inbox_item_id,user_id) references public.inbox_items(id,user_id) on delete cascade,
  foreign key (domain_command_id,user_id) references public.domain_commands(id,user_id)
);

create table public.external_references (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null, external_type text not null, external_id text not null, external_version text,
  ownership text not null check (ownership in ('external','amber_managed')), content_hash text,
  internal_entity_type text not null, internal_entity_id uuid not null,
  sync_status text not null check (sync_status in ('active','stale','deleted','conflict')),
  first_seen_at timestamptz not null, last_seen_at timestamptz not null, deleted_at timestamptz,
  unique(id,user_id), unique(user_id,source,external_type,external_id)
);

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null, external_account_id text, status text not null, secret_ref text, metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz, last_sync_at timestamptz, created_at timestamptz not null default now(), unique(id,user_id)
);
