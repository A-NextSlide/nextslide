-- Agentic Slide Editor Chat — Supabase Schema (v0.1)
-- Creates: agent_sessions, agent_messages, agent_edits, attachments
-- Adds RLS policies, indexes, and helpful triggers

-- Prerequisites
create extension if not exists "pgcrypto";

-- =====================================================================================
-- Tables
-- =====================================================================================

-- 1) agent_sessions: one conversational context for a deck/slide and UI selections
create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  deck_id uuid not null references public.decks(uuid) on delete cascade,
  slide_id text null,
  title text null,
  metadata jsonb not null default '{}'::jsonb,
  agent_profile text not null default 'authoring',
  model text null,
  status text not null default 'active' check (status in ('active','ended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  ended_at timestamptz null,
  archived_at timestamptz null
);

create index if not exists idx_agent_sessions_user_id on public.agent_sessions(user_id);
create index if not exists idx_agent_sessions_deck_id on public.agent_sessions(deck_id);
create index if not exists idx_agent_sessions_status on public.agent_sessions(status);
create index if not exists idx_agent_sessions_created_at on public.agent_sessions(created_at desc);

-- 2) agent_messages: chat messages with optional attachments, selections, context
create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  text text null,
  attachments jsonb not null default '[]'::jsonb,
  selections jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_messages_session_id on public.agent_messages(session_id);
create index if not exists idx_agent_messages_created_at on public.agent_messages(created_at desc);
create index if not exists idx_agent_messages_role on public.agent_messages(role);
create index if not exists idx_agent_messages_selections_gin on public.agent_messages using gin (selections);

-- 3) agent_edits: proposed/applied/reverted diffs with snapshots for revert
create table if not exists public.agent_edits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  deck_id uuid not null references public.decks(uuid) on delete cascade,
  slide_ids text[] not null default array[]::text[],
  status text not null default 'proposed' check (status in ('proposed','applied','reverted')),
  diff jsonb not null default '{}'::jsonb,
  summary text null,
  deck_revision text null,
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  created_at timestamptz not null default now(),
  applied_at timestamptz null,
  applied_by uuid null references public.users(id) on delete set null,
  reverted_at timestamptz null
);

create index if not exists idx_agent_edits_session_id on public.agent_edits(session_id);
create index if not exists idx_agent_edits_deck_id on public.agent_edits(deck_id);
create index if not exists idx_agent_edits_status on public.agent_edits(status);
create index if not exists idx_agent_edits_created_at on public.agent_edits(created_at desc);
create index if not exists idx_agent_edits_diff_gin on public.agent_edits using gin (diff);

-- 4) agent_events: persisted event stream (plan/tool updates, preview diffs, etc.)
create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  user_id uuid null references public.users(id) on delete set null,
  message_id uuid null references public.agent_messages(id) on delete set null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_events_session_id on public.agent_events(session_id);
create index if not exists idx_agent_events_created_at on public.agent_events(created_at desc);
create index if not exists idx_agent_events_type on public.agent_events(type);
create index if not exists idx_agent_events_data_gin on public.agent_events using gin (data);

-- 5) attachments: registered uploads tied to a session/user
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid null references public.agent_sessions(id) on delete set null,
  mime_type text null,
  name text null,
  size bigint null,
  url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_attachments_user_id on public.attachments(user_id);
create index if not exists idx_attachments_session_id on public.attachments(session_id);
create index if not exists idx_attachments_created_at on public.attachments(created_at desc);

-- =====================================================================================
-- Triggers
-- =====================================================================================

-- updated_at on agent_sessions
create or replace function public.set_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agent_sessions_set_updated_at on public.agent_sessions;
create trigger trg_agent_sessions_set_updated_at
before update on public.agent_sessions
for each row execute procedure public.set_timestamp_updated_at();

-- last_activity bump on new messages
create or replace function public.bump_session_last_activity()
returns trigger as $$
begin
  update public.agent_sessions
     set last_activity = now()
   where id = new.session_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agent_messages_bump_activity on public.agent_messages;
create trigger trg_agent_messages_bump_activity
after insert on public.agent_messages
for each row execute procedure public.bump_session_last_activity();

-- =====================================================================================
-- Optional schema evolutions (safe to run repeatedly)
-- =====================================================================================

-- Add columns if missing for persistence ergonomics
alter table if exists public.agent_sessions
  add column if not exists title text,
  add column if not exists ended_at timestamptz,
  add column if not exists archived_at timestamptz;

-- =====================================================================================
-- Row Level Security (RLS)
-- =====================================================================================

alter table public.agent_sessions enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_edits enable row level security;
alter table public.agent_events enable row level security;
alter table public.attachments enable row level security;

-- Policies: session owner only (admins can be added later if you maintain roles)

-- agent_sessions: owner can select/insert/update/delete
drop policy if exists "agent_sessions_owner_select" on public.agent_sessions;
create policy "agent_sessions_owner_select" on public.agent_sessions
  for select using (user_id = auth.uid());

drop policy if exists "agent_sessions_owner_insert" on public.agent_sessions;
create policy "agent_sessions_owner_insert" on public.agent_sessions
  for insert with check (user_id = auth.uid());

drop policy if exists "agent_sessions_owner_update" on public.agent_sessions;
create policy "agent_sessions_owner_update" on public.agent_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "agent_sessions_owner_delete" on public.agent_sessions;
create policy "agent_sessions_owner_delete" on public.agent_sessions
  for delete using (user_id = auth.uid());

-- agent_messages: accessible via owning session
drop policy if exists "agent_messages_session_owner_select" on public.agent_messages;
create policy "agent_messages_session_owner_select" on public.agent_messages
  for select using (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_messages.session_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "agent_messages_session_owner_insert" on public.agent_messages;
create policy "agent_messages_session_owner_insert" on public.agent_messages
  for insert with check (
    user_id = auth.uid() and exists (
      select 1 from public.agent_sessions s
       where s.id = agent_messages.session_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "agent_messages_session_owner_update" on public.agent_messages;
create policy "agent_messages_session_owner_update" on public.agent_messages
  for update using (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_messages.session_id
         and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_messages.session_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "agent_messages_session_owner_delete" on public.agent_messages;
create policy "agent_messages_session_owner_delete" on public.agent_messages
  for delete using (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_messages.session_id
         and s.user_id = auth.uid()
    )
  );

-- agent_edits: accessible via owning session
drop policy if exists "agent_edits_session_owner_select" on public.agent_edits;
create policy "agent_edits_session_owner_select" on public.agent_edits
  for select using (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_edits.session_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "agent_edits_session_owner_insert" on public.agent_edits;
create policy "agent_edits_session_owner_insert" on public.agent_edits
  for insert with check (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_edits.session_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "agent_edits_session_owner_update" on public.agent_edits;
create policy "agent_edits_session_owner_update" on public.agent_edits
  for update using (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_edits.session_id
         and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_edits.session_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "agent_edits_session_owner_delete" on public.agent_edits;
create policy "agent_edits_session_owner_delete" on public.agent_edits
  for delete using (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_edits.session_id
         and s.user_id = auth.uid()
    )
  );

-- attachments: owner can access
drop policy if exists "attachments_owner_select" on public.attachments;
create policy "attachments_owner_select" on public.attachments
  for select using (user_id = auth.uid());

drop policy if exists "attachments_owner_insert" on public.attachments;
create policy "attachments_owner_insert" on public.attachments
  for insert with check (user_id = auth.uid());

drop policy if exists "attachments_owner_delete" on public.attachments;
create policy "attachments_owner_delete" on public.attachments
  for delete using (user_id = auth.uid());

-- agent_events: accessible via owning session
drop policy if exists "agent_events_session_owner_select" on public.agent_events;
create policy "agent_events_session_owner_select" on public.agent_events
  for select using (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_events.session_id
         and s.user_id = auth.uid()
    )
  );

drop policy if exists "agent_events_session_owner_insert" on public.agent_events;
create policy "agent_events_session_owner_insert" on public.agent_events
  for insert with check (
    exists (
      select 1 from public.agent_sessions s
       where s.id = agent_events.session_id
         and s.user_id = auth.uid()
    )
  );

-- =====================================================================================
-- Helpful Views (optional)
-- =====================================================================================

-- Recent edits per session
create or replace view public.v_agent_recent_edits as
  select e.* from public.agent_edits e
  order by e.created_at desc;

-- Unified session timeline: messages, edits, and events (for history UI)
drop view if exists public.v_agent_session_timeline;
create or replace view public.v_agent_session_timeline as
  select m.session_id,
         m.id as ref_id,
         'message'::text as ref_type,
         m.created_at,
         jsonb_build_object(
           'role', m.role,
           'text', m.text,
           'attachments', m.attachments,
           'selections', m.selections,
           'context', m.context,
           'user_id', m.user_id
         ) as payload
    from public.agent_messages m
  union all
  select e.session_id,
         e.id as ref_id,
         'edit'::text as ref_type,
         e.created_at,
         jsonb_build_object(
           'status', e.status,
           'diff', e.diff,
           'summary', e.summary,
           'deck_revision', e.deck_revision,
           'slide_ids', e.slide_ids
         ) as payload
    from public.agent_edits e
  union all
  select ev.session_id,
         ev.id as ref_id,
         'event'::text as ref_type,
         ev.created_at,
         jsonb_build_object(
           'type', ev.type,
           'data', ev.data,
           'message_id', ev.message_id,
           'user_id', ev.user_id
         ) as payload
    from public.agent_events ev;

-- =====================================================================================
-- Notices
-- =====================================================================================
do $$
begin
  raise notice 'Agentic chat tables created/updated.';
  raise notice 'Tables: agent_sessions, agent_messages, agent_edits, agent_events, attachments';
  raise notice 'RLS enforced: owner-only access.';
end $$;


