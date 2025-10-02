-- Google Slides/Drive Integration Tables

create table if not exists public.google_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_email text,
  refresh_token text,
  access_token text,
  access_token_expiry timestamptz,
  scopes text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_google_oauth_tokens_user on public.google_oauth_tokens(user_id);

create table if not exists public.conversion_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('IMPORT_SLIDES','IMPORT_PPTX','EXPORT_EDITABLE','EXPORT_IMAGES')),
  status text not null check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  input jsonb,
  result jsonb,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_conversion_jobs_user on public.conversion_jobs(user_id);
create index if not exists idx_conversion_jobs_status on public.conversion_jobs(status);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.conversion_jobs(id) on delete cascade,
  kind text not null check (kind in ('SLIDE_IMAGE','PPTX_BLOB','LOG')),
  url text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_artifacts_job on public.artifacts(job_id);

-- RLS policies (allow owner read/write)
alter table public.google_oauth_tokens enable row level security;
alter table public.conversion_jobs enable row level security;
alter table public.artifacts enable row level security;

-- Chart bindings for Google Sheets live data
create table if not exists public.chart_data_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null,
  slide_id text not null,
  component_id text not null,
  provider text not null check (provider in ('google_sheets')),
  spreadsheet_id text not null,
  sheet_title text,
  range_a1 text not null,
  mapping jsonb not null,
  etag text,
  last_hash text,
  status text not null default 'active' check (status in ('active','paused','error')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_chart_bindings_user on public.chart_data_bindings(user_id);
create index if not exists idx_chart_bindings_component on public.chart_data_bindings(component_id);
create unique index if not exists uniq_chart_binding_component on public.chart_data_bindings(component_id);

-- Drive watch channels for push notifications
create table if not exists public.google_drive_watch_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id text not null,
  resource_uri text not null,
  channel_id text not null,
  channel_token text,
  expiration timestamptz,
  spreadsheet_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_drive_watch_user on public.google_drive_watch_channels(user_id);
create index if not exists idx_drive_watch_resource on public.google_drive_watch_channels(resource_id);

do $$ begin
  create policy google_tokens_owner on public.google_oauth_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversion_jobs_owner on public.conversion_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy artifacts_owner on public.artifacts
  for all using (
    exists (select 1 from public.conversion_jobs j where j.id = job_id and j.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.conversion_jobs j where j.id = job_id and j.user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy chart_bindings_owner on public.chart_data_bindings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy drive_watch_channels_owner on public.google_drive_watch_channels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;


