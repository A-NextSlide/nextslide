-- ============================================================================
-- Migration 029: Security Hardening
-- ============================================================================
-- Addresses multiple security vulnerabilities discovered during audit:
--   1. Tables with overly permissive RLS policies (USING true / WITH CHECK true)
--   2. Tables missing RLS entirely
--   3. SECURITY DEFINER functions callable by any user
--   4. Storage bucket policies without auth checks
--   5. Storage buckets without size/type limits
-- ============================================================================

-- ============================================================================
-- 1. FIX: api_generation_jobs — RLS DISABLED with user_id column
-- ============================================================================
-- This table contains user data but has no RLS, meaning any user hitting the
-- PostgREST API can read/modify all rows.

ALTER TABLE IF EXISTS api_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own generation jobs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'api_generation_jobs' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "api_generation_jobs_select_own" ON api_generation_jobs;
    CREATE POLICY "api_generation_jobs_select_own" ON api_generation_jobs
      FOR SELECT USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "api_generation_jobs_insert_own" ON api_generation_jobs;
    CREATE POLICY "api_generation_jobs_insert_own" ON api_generation_jobs
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "api_generation_jobs_update_own" ON api_generation_jobs;
    CREATE POLICY "api_generation_jobs_update_own" ON api_generation_jobs
      FOR UPDATE USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "api_generation_jobs_delete_own" ON api_generation_jobs;
    CREATE POLICY "api_generation_jobs_delete_own" ON api_generation_jobs
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================================
-- 2. FIX: integration_settings — RLS DISABLED (system-wide config table)
-- ============================================================================
-- Even though it's system-wide config, RLS should be enabled to prevent
-- anonymous/authenticated users from modifying it via the REST API.
-- Service role (used by backend) bypasses RLS automatically.

ALTER TABLE IF EXISTS integration_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to READ integration settings (needed for frontend)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'integration_settings' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "integration_settings_read_authenticated" ON integration_settings;
    CREATE POLICY "integration_settings_read_authenticated" ON integration_settings
      FOR SELECT TO authenticated
      USING (true);
    -- No INSERT/UPDATE/DELETE policies → only service_role can write
  END IF;
END $$;


-- ============================================================================
-- 3. FIX: growth_config — Policy allows ALL users full CRUD access
-- ============================================================================
-- Current policy: USING (true) WITH CHECK (true) → any user can read/write.
-- Intent: Only service_role (backend) should write. Authenticated users may read.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'growth_config' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Service role full access on growth_config" ON growth_config;

    -- Authenticated users can read config values
    DROP POLICY IF EXISTS "growth_config_read_authenticated" ON growth_config;
    CREATE POLICY "growth_config_read_authenticated" ON growth_config
      FOR SELECT TO authenticated
      USING (true);
    -- No INSERT/UPDATE/DELETE policies → only service_role can write
  END IF;
END $$;


-- ============================================================================
-- 4. FIX: pqa_domains — Policy allows ALL users full CRUD access
-- ============================================================================
-- This is internal enterprise-detection data. No end-user should access it.
-- Only service_role (backend) needs access.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pqa_domains' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "pqa_domains_service_all" ON pqa_domains;
    -- No policies at all → only service_role can access (RLS is already enabled)
  END IF;
END $$;


-- ============================================================================
-- 5. FIX: pqa_upgrade_prompts — Policy allows ALL users full CRUD access
-- ============================================================================
-- Users should only see their own upgrade prompts.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pqa_upgrade_prompts' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "pqa_upgrade_prompts_service_all" ON pqa_upgrade_prompts;

    -- Users can view their own upgrade prompts
    DROP POLICY IF EXISTS "pqa_upgrade_prompts_select_own" ON pqa_upgrade_prompts;
    CREATE POLICY "pqa_upgrade_prompts_select_own" ON pqa_upgrade_prompts
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);

    -- Users can update their own prompts (e.g., dismiss)
    DROP POLICY IF EXISTS "pqa_upgrade_prompts_update_own" ON pqa_upgrade_prompts;
    CREATE POLICY "pqa_upgrade_prompts_update_own" ON pqa_upgrade_prompts
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id);
    -- INSERT/DELETE → service_role only
  END IF;
END $$;


-- ============================================================================
-- 6. FIX: slack_workspaces — Policy allows ALL users full CRUD access
-- ============================================================================
-- Contains encrypted bot tokens. Must be restricted to service_role only.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'slack_workspaces' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "slack_workspaces_service" ON slack_workspaces;
    -- No policies → only service_role can access (RLS is already enabled)
  END IF;
END $$;


-- ============================================================================
-- 7. FIX: slack_user_mappings — Policy allows ALL users full CRUD access
-- ============================================================================
-- Contains user-to-Slack account links. Users should only see their own.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'slack_user_mappings' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "slack_user_mappings_service" ON slack_user_mappings;

    -- Users can view their own Slack mapping
    DROP POLICY IF EXISTS "slack_user_mappings_select_own" ON slack_user_mappings;
    CREATE POLICY "slack_user_mappings_select_own" ON slack_user_mappings
      FOR SELECT TO authenticated
      USING (auth.uid() = nextslide_user_id);
    -- All write operations → service_role only
  END IF;
END $$;


-- ============================================================================
-- 8. FIX: slack_generation_sessions — Policy allows ALL users full CRUD access
-- ============================================================================
-- Contains session data including Slack response URLs. Users see their own only.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'slack_generation_sessions' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "slack_generation_sessions_service" ON slack_generation_sessions;

    -- Users can view their own generation sessions
    DROP POLICY IF EXISTS "slack_generation_sessions_select_own" ON slack_generation_sessions;
    CREATE POLICY "slack_generation_sessions_select_own" ON slack_generation_sessions
      FOR SELECT TO authenticated
      USING (auth.uid() = nextslide_user_id);
    -- All write operations → service_role only
  END IF;
END $$;


-- ============================================================================
-- 9. FIX: grant_admin_access() — Privilege escalation vector
-- ============================================================================
-- This SECURITY DEFINER function grants admin role to any email with NO
-- authorization check. Any authenticated user can call it via RPC to make
-- themselves (or anyone) an admin.
-- Fix: Revoke EXECUTE from all non-superuser roles.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'grant_admin_access') THEN
    REVOKE EXECUTE ON FUNCTION grant_admin_access(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION grant_admin_access(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION grant_admin_access(text) FROM authenticated;
  END IF;
END $$;


-- ============================================================================
-- 10. FIX: get_recent_decks() — Leaks all users' deck metadata
-- ============================================================================
-- If this function exists, it returns recent decks for ALL users without
-- checking auth.uid(). Revoke public access.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_recent_decks') THEN
    REVOKE EXECUTE ON FUNCTION get_recent_decks FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION get_recent_decks FROM anon;
    REVOKE EXECUTE ON FUNCTION get_recent_decks FROM authenticated;
  END IF;
END $$;


-- ============================================================================
-- 11. FIX: get_user_accessible_decks() — No caller verification
-- ============================================================================
-- Accepts arbitrary user_id parameter. Any user can enumerate another user's
-- deck list. Revoke from non-service roles.

-- Targeted revoke (handles multiple overloads)
DO $$
DECLARE
  func_oid OID;
BEGIN
  FOR func_oid IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'get_user_accessible_decks' AND n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', func_oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', func_oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', func_oid::regprocedure);
  END LOOP;
END $$;


-- ============================================================================
-- 12. FIX: associate_anonymous_deck_with_user() — Deck claim without auth
-- ============================================================================
-- Any user could claim any anonymous deck. Revoke public access.

DO $$
DECLARE
  func_oid OID;
BEGIN
  FOR func_oid IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'associate_anonymous_deck_with_user' AND n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', func_oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', func_oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', func_oid::regprocedure);
  END LOOP;
END $$;


-- ============================================================================
-- 13. FIX: cleanup_old_autosaves() — No authorization check
-- ============================================================================
-- SECURITY DEFINER function that deletes deck versions. Revoke from public.

DO $$
DECLARE
  func_oid OID;
BEGIN
  FOR func_oid IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'cleanup_old_autosaves' AND n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', func_oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', func_oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', func_oid::regprocedure);
  END LOOP;
END $$;


-- ============================================================================
-- 14. FIX: slide-media storage — Completely open policies (no auth checks)
-- ============================================================================
-- Current policies allow ANY user (including anonymous) to upload, read,
-- update, and DELETE any file. This is a critical vulnerability.
--
-- Fix: Require authentication for write operations. Allow public reads
-- (since the bucket is public and used for shared presentation media).

-- Drop existing wide-open policies
DROP POLICY IF EXISTS "Enable delete" ON storage.objects;
DROP POLICY IF EXISTS "Enable insert" ON storage.objects;
DROP POLICY IF EXISTS "Enable read access" ON storage.objects;
DROP POLICY IF EXISTS "Enable update" ON storage.objects;

-- Public read access for slide-media (needed for shared/embedded presentations)
CREATE POLICY "slide_media_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'slide-media');

-- Only authenticated users can upload to slide-media
CREATE POLICY "slide_media_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'slide-media');

-- Only authenticated users can update files in slide-media
CREATE POLICY "slide_media_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'slide-media');

-- Only authenticated users can delete files in slide-media
CREATE POLICY "slide_media_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'slide-media');


-- ============================================================================
-- 15. FIX: thumbnails storage — No policies defined at all
-- ============================================================================
-- The thumbnails bucket is public (for rendering in shared decks) but has
-- zero storage policies. Add read-only public access and auth-only writes.

-- Public read access for thumbnails
CREATE POLICY "thumbnails_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'thumbnails');

-- Only authenticated users (or service_role via backend) can write thumbnails
CREATE POLICY "thumbnails_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "thumbnails_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'thumbnails');

CREATE POLICY "thumbnails_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'thumbnails');


-- ============================================================================
-- 16. FIX: Storage bucket limits
-- ============================================================================
-- Add file size limits and MIME type restrictions to prevent abuse.

-- slide-media: 50MB max, common media types only
UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50MB
    allowed_mime_types = ARRAY[
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/wav',
      'application/pdf'
    ]
WHERE id = 'slide-media';

-- thumbnails: 5MB max, images only
UPDATE storage.buckets
SET file_size_limit = 5242880,  -- 5MB
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'thumbnails';

-- api-context-images: 10MB max, images only
UPDATE storage.buckets
SET file_size_limit = 10485760,  -- 10MB
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
WHERE id = 'api-context-images';


-- ============================================================================
-- 17. FIX: admin_audit_logs INSERT — Wide open
-- ============================================================================
-- The INSERT policy on admin_audit_logs has WITH CHECK (true), allowing any
-- user to insert fake audit log entries. Restrict to service_role only.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'admin_audit_logs' AND schemaname = 'public') THEN
    -- Drop the permissive insert policy (name may vary)
    DROP POLICY IF EXISTS "Allow insert for audit logging" ON admin_audit_logs;
    DROP POLICY IF EXISTS "admin_audit_logs_insert" ON admin_audit_logs;
    DROP POLICY IF EXISTS "Enable insert for audit logging" ON admin_audit_logs;
    -- No new INSERT policy → only service_role can insert audit logs
  END IF;
END $$;


-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- Tables hardened:
--   - api_generation_jobs: RLS enabled + user_id scoped policies
--   - integration_settings: RLS enabled + read-only for authenticated
--   - growth_config: Restricted to read-only for authenticated
--   - pqa_domains: Restricted to service_role only
--   - pqa_upgrade_prompts: Restricted to own records for authenticated
--   - slack_workspaces: Restricted to service_role only
--   - slack_user_mappings: Restricted to own records for authenticated
--   - slack_generation_sessions: Restricted to own records for authenticated
--   - admin_audit_logs: INSERT restricted to service_role only
--
-- Functions secured:
--   - grant_admin_access(): EXECUTE revoked from public/anon/authenticated
--   - get_recent_decks(): EXECUTE revoked from public/anon/authenticated
--   - get_user_accessible_decks(): EXECUTE revoked from public/anon/authenticated
--   - associate_anonymous_deck_with_user(): EXECUTE revoked
--   - cleanup_old_autosaves(): EXECUTE revoked
--
-- Storage hardened:
--   - slide-media: Auth required for write ops, public reads preserved
--   - thumbnails: Auth required for write ops, public reads added
--   - All buckets: File size limits + MIME type restrictions added
-- ============================================================================
