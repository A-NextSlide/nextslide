-- ============================================================================
-- Migration 034: RLS Policy Tightening & Foreign Key Indexes
-- ============================================================================
-- Addresses remaining Supabase linter findings:
--
-- [WARN] 4x RLS policies with USING(true) / WITH CHECK(true) on INSERT/UPDATE
--   → Tighten with FK existence checks and time-based restrictions
--
-- [INFO] 6x Tables with RLS enabled but no policies
--   → Intentionally service_role-only; documented below
--
-- [INFO] ~20 Unindexed foreign keys
--   → Add covering indexes for FK columns to improve JOIN/DELETE performance
--
-- [INFO] Unused indexes
--   → Identified and dropped where safe
-- ============================================================================


-- ============================================================================
-- PART 1: Tighten RLS Policies (WARN level)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. share_view_events INSERT — require valid, active share link
-- ----------------------------------------------------------------------------
-- Previously: WITH CHECK (true) — anyone could insert for any share_id.
-- Fix: Validate that share_id references an existing, active deck_share.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'share_view_events' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Anyone can track views" ON share_view_events;

    CREATE POLICY "Track views for valid shares" ON share_view_events
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM deck_shares ds
          WHERE ds.id = share_id
            AND ds.is_active = true
        )
      );
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1b. share_view_events UPDATE — restrict to recent sessions only
-- ----------------------------------------------------------------------------
-- Previously: USING (true) WITH CHECK (session_id = session_id) — both always
-- true (column compared to itself is a no-op).
-- Fix: Only allow updating sessions started within the last 24 hours.
-- This prevents manipulation of historical analytics data while still allowing
-- the app to update duration/slides as the viewer progresses.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'share_view_events' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Update own session only" ON share_view_events;

    CREATE POLICY "Update recent sessions only" ON share_view_events
      FOR UPDATE
      USING (started_at > now() - interval '24 hours')
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM deck_shares ds
          WHERE ds.id = share_id
            AND ds.is_active = true
        )
      );
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1c. share_viewers INSERT — require valid, active share link
-- ----------------------------------------------------------------------------
-- Previously: WITH CHECK (true) — anyone could register for any share_id.
-- Fix: Validate share_id references an existing, active deck_share.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'share_viewers' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Anyone can register as viewer" ON share_viewers;

    CREATE POLICY "Register as viewer for valid shares" ON share_viewers
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM deck_shares ds
          WHERE ds.id = share_id
            AND ds.is_active = true
        )
      );
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1d. webpage_leads INSERT — require valid published webpage
-- ----------------------------------------------------------------------------
-- Previously: WITH CHECK (true) — anyone could insert leads for any webpage_id.
-- Fix: Validate webpage_id references an existing published webpage.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'webpage_leads' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Anyone can insert leads" ON webpage_leads;

    CREATE POLICY "Insert leads for valid webpages" ON webpage_leads
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM published_webpages pw
          WHERE pw.id = webpage_id
        )
      );
  END IF;
END $$;


-- ============================================================================
-- PART 2: Tables with RLS Enabled but No Policies (INFO level)
-- ============================================================================
-- These tables intentionally have RLS enabled with NO policies, making them
-- accessible only via service_role (which bypasses RLS). This is correct for
-- backend-managed data. No changes needed, documented here for clarity:
--
--   daily_view_stats    — Aggregated by backend cron, no direct user access
--   pqa_domains         — Internal enterprise detection data
--   presentation_views  — Analytics written by backend, no user_id column
--   profile_views       — Analytics written by backend
--   slack_workspaces    — Contains encrypted bot tokens
--   slide_engagement    — Analytics written by backend, no user_id column
--
-- The service_role bypass policies that previously existed on these tables
-- were dropped in migration 032 because service_role naturally bypasses RLS.
-- ============================================================================


-- ============================================================================
-- PART 3: Add Indexes for Unindexed Foreign Keys (INFO level)
-- ============================================================================
-- Foreign key columns without covering indexes cause sequential scans during
-- cascading DELETE operations and JOIN queries. Adding B-tree indexes on these
-- columns improves performance significantly.
--
-- Strategy: Use CREATE INDEX IF NOT EXISTS with DO blocks that verify both
-- the table and column exist before creating the index.
-- ============================================================================

-- Helper function for conditional index creation
CREATE OR REPLACE FUNCTION pg_temp.create_fk_index(
  p_index_name TEXT,
  p_table_name TEXT,
  p_column_name TEXT
) RETURNS VOID AS $$
BEGIN
  -- Only create if table and column exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) THEN
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
      p_index_name, p_table_name, p_column_name
    );
  END IF;
END;
$$ LANGUAGE plpgsql;


-- agent_edits
SELECT pg_temp.create_fk_index('idx_agent_edits_deck_id', 'agent_edits', 'deck_id');
SELECT pg_temp.create_fk_index('idx_agent_edits_user_id', 'agent_edits', 'user_id');

-- agent_events (2 FK columns)
SELECT pg_temp.create_fk_index('idx_agent_events_deck_id', 'agent_events', 'deck_id');
SELECT pg_temp.create_fk_index('idx_agent_events_user_id', 'agent_events', 'user_id');
SELECT pg_temp.create_fk_index('idx_agent_events_session_id', 'agent_events', 'session_id');

-- agent_messages
SELECT pg_temp.create_fk_index('idx_agent_messages_deck_id', 'agent_messages', 'deck_id');
SELECT pg_temp.create_fk_index('idx_agent_messages_user_id', 'agent_messages', 'user_id');

-- api_generation_jobs
SELECT pg_temp.create_fk_index('idx_api_generation_jobs_user_id', 'api_generation_jobs', 'user_id');

-- chat_feedback
SELECT pg_temp.create_fk_index('idx_chat_feedback_user_id', 'chat_feedback', 'user_id');
SELECT pg_temp.create_fk_index('idx_chat_feedback_deck_id', 'chat_feedback', 'deck_id');

-- comments (deck_id and author_id)
SELECT pg_temp.create_fk_index('idx_comments_deck_id', 'comments', 'deck_id');
SELECT pg_temp.create_fk_index('idx_comments_author_id', 'comments', 'author_id');

-- community_decks (reviewed_by — deck_uuid already covered by unique constraint)
SELECT pg_temp.create_fk_index('idx_community_decks_reviewed_by', 'community_decks', 'reviewed_by');

-- deck_team_access
SELECT pg_temp.create_fk_index('idx_deck_team_access_deck_id', 'deck_team_access', 'deck_id');
SELECT pg_temp.create_fk_index('idx_deck_team_access_team_id', 'deck_team_access', 'team_id');

-- invitations (2 FK columns flagged)
SELECT pg_temp.create_fk_index('idx_invitations_team_id', 'invitations', 'team_id');
SELECT pg_temp.create_fk_index('idx_invitations_deck_id', 'invitations', 'deck_id');
SELECT pg_temp.create_fk_index('idx_invitations_invited_by', 'invitations', 'invited_by_user_id');
SELECT pg_temp.create_fk_index('idx_invitations_accepted_by', 'invitations', 'accepted_by_user_id');

-- share_link_analytics (2 FK columns)
SELECT pg_temp.create_fk_index('idx_share_link_analytics_user_id', 'share_link_analytics', 'user_id');
SELECT pg_temp.create_fk_index('idx_share_link_analytics_share_id', 'share_link_analytics', 'share_id');

-- share_view_events (viewer_id — share_id already indexed)
SELECT pg_temp.create_fk_index('idx_share_view_events_viewer_id', 'share_view_events', 'viewer_id');

-- slack_generation_sessions (nextslide_user_id)
SELECT pg_temp.create_fk_index('idx_slack_gen_sessions_user_id', 'slack_generation_sessions', 'nextslide_user_id');

-- slack_workspaces (installer_user_id)
SELECT pg_temp.create_fk_index('idx_slack_workspaces_installer', 'slack_workspaces', 'installer_user_id');

-- subscriptions (plan_id — user_id already indexed)
SELECT pg_temp.create_fk_index('idx_subscriptions_plan_id', 'subscriptions', 'plan_id');

-- team_members
SELECT pg_temp.create_fk_index('idx_team_members_team_id', 'team_members', 'team_id');
SELECT pg_temp.create_fk_index('idx_team_members_user_id', 'team_members', 'user_id');

-- teams (owner_id)
SELECT pg_temp.create_fk_index('idx_teams_owner_id', 'teams', 'owner_id');


-- ============================================================================
-- PART 4: Drop Unused Indexes
-- ============================================================================
-- The Performance Advisor identified indexes that have never been scanned.
-- Unused indexes consume disk space and slow down INSERT/UPDATE/DELETE.
--
-- Approach: Only drop indexes where we can verify the table has a better
-- covering index or the index is clearly redundant.
-- ============================================================================

-- share_viewers: idx_share_viewers_registered_at is unused (queries filter by share_id, not date)
DROP INDEX IF EXISTS idx_share_viewers_registered_at;

-- share_view_events: idx_share_view_events_started_at is unused (queries use share_id or session_id)
DROP INDEX IF EXISTS idx_share_view_events_started_at;


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- RLS policies tightened:
--   share_view_events INSERT → validates share_id exists and is active
--   share_view_events UPDATE → restricted to sessions < 24h old
--   share_viewers INSERT     → validates share_id exists and is active
--   webpage_leads INSERT     → validates webpage_id exists
--
-- FK indexes added (up to 25, skipped if column doesn't exist):
--   agent_edits, agent_events, agent_messages, api_generation_jobs,
--   chat_feedback, comments, community_decks, deck_team_access,
--   invitations, share_link_analytics, share_view_events,
--   slack_generation_sessions, slack_workspaces, subscriptions,
--   team_members, teams
--
-- Unused indexes dropped:
--   idx_share_viewers_registered_at
--   idx_share_view_events_started_at
-- ============================================================================
