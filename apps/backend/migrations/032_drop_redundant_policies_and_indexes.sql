-- ============================================================================
-- Migration 032: Drop Redundant Policies & Duplicate Indexes
-- ============================================================================
-- Fixes "Multiple Permissive Policies" warnings from the Supabase linter.
--
-- Root causes:
--   1. service_role bypass policies are dead code — service_role bypasses RLS
--      entirely in Supabase. These policies only add overhead for anon/auth.
--   2. Duplicate policies with different names doing the same thing.
--   3. Duplicate indexes on the same columns.
--
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
-- ============================================================================


-- ============================================================================
-- 1. Drop redundant service_role bypass policies
-- ============================================================================
-- service_role bypasses RLS by default in Supabase. These FOR ALL policies
-- with USING (auth.role() = 'service_role') are never used by service_role
-- but ARE evaluated (returning false) for every anon/authenticated query.

DROP POLICY IF EXISTS "Service role full access" ON api_keys;
DROP POLICY IF EXISTS "Service can manage feedback" ON cancellation_feedback;
DROP POLICY IF EXISTS "Service role can manage all community decks" ON community_decks;
DROP POLICY IF EXISTS "Service can manage balances" ON credit_balances;
DROP POLICY IF EXISTS "Service can manage transactions" ON credit_transactions;
DROP POLICY IF EXISTS "Service role manage daily views" ON daily_view_stats;
DROP POLICY IF EXISTS "Service role can manage featured decks" ON featured_decks;
DROP POLICY IF EXISTS "Service role manage preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Service role manage notifications" ON notifications;
DROP POLICY IF EXISTS "Service role manage views" ON presentation_views;
DROP POLICY IF EXISTS "Service role manage profile views" ON profile_views;
DROP POLICY IF EXISTS "Service role full access referral_codes" ON referral_codes;
DROP POLICY IF EXISTS "Service role full access referrals" ON referrals;
DROP POLICY IF EXISTS "Service role full access upvotes" ON showcase_upvotes;
DROP POLICY IF EXISTS "Service role manage engagement" ON slide_engagement;
DROP POLICY IF EXISTS "Service can manage subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service role manage templates" ON templates;
DROP POLICY IF EXISTS "Service role manage badges" ON user_badges;
DROP POLICY IF EXISTS "Service role manage follows" ON user_follows;
DROP POLICY IF EXISTS "Service role manage streaks" ON user_streaks;

-- Tables with service_role policies created via dashboard
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage palettes' AND tablename = 'palettes') THEN
    DROP POLICY "Service role can manage palettes" ON palettes;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_cancellation_feedback' AND tablename = 'cancellation_feedback') THEN
    DROP POLICY "service_role_bypass_cancellation_feedback" ON cancellation_feedback;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_comments' AND tablename = 'comments') THEN
    DROP POLICY "service_role_bypass_comments" ON comments;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_credit_costs' AND tablename = 'credit_costs') THEN
    DROP POLICY "service_role_bypass_credit_costs" ON credit_costs;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_deck_team_access' AND tablename = 'deck_team_access') THEN
    DROP POLICY "service_role_bypass_deck_team_access" ON deck_team_access;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_deck_user_access' AND tablename = 'deck_user_access') THEN
    DROP POLICY "service_role_bypass_deck_user_access" ON deck_user_access;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_invitations' AND tablename = 'invitations') THEN
    DROP POLICY "service_role_bypass_invitations" ON invitations;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_team_members' AND tablename = 'team_members') THEN
    DROP POLICY "service_role_bypass_team_members" ON team_members;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_teams' AND tablename = 'teams') THEN
    DROP POLICY "service_role_bypass_teams" ON teams;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass_pricing_plans' AND tablename = 'pricing_plans') THEN
    DROP POLICY "service_role_bypass_pricing_plans" ON pricing_plans;
  END IF;
END $$;


-- ============================================================================
-- 2. Drop duplicate policies on users table
-- ============================================================================
-- "Service role bypass" and "Service role can manage all users" do the same thing
-- "Users can view own profile" and "Users view own profile" do the same thing

DO $$ BEGIN
  -- Keep "Service role can manage all users", drop "Service role bypass"
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role bypass' AND tablename = 'users')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage all users' AND tablename = 'users')
  THEN
    DROP POLICY "Service role bypass" ON users;
  END IF;

  -- Now drop the remaining one too (it's a redundant service_role policy)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage all users' AND tablename = 'users') THEN
    DROP POLICY "Service role can manage all users" ON users;
  END IF;

  -- Keep "Users can view own profile", drop "Users view own profile"
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users view own profile' AND tablename = 'users')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own profile' AND tablename = 'users')
  THEN
    DROP POLICY "Users view own profile" ON users;
  END IF;
END $$;


-- ============================================================================
-- 3. Drop duplicate policies on admin_audit_logs
-- ============================================================================
-- admin_audit_logs_admin_only (FOR ALL) already covers INSERT,
-- so admin_audit_logs_insert_admin_only is redundant.
-- Also drop the SELECT-specific policy since FOR ALL covers it.

DROP POLICY IF EXISTS "admin_audit_logs_insert_admin_only" ON admin_audit_logs;
DROP POLICY IF EXISTS "Admin audit logs are viewable by admins only" ON admin_audit_logs;


-- ============================================================================
-- 4. Drop duplicate policies on deck_versions
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view deck versions' AND tablename = 'deck_versions')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their deck versions' AND tablename = 'deck_versions')
  THEN
    DROP POLICY "Users can view deck versions" ON deck_versions;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create deck versions' AND tablename = 'deck_versions')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create their deck versions' AND tablename = 'deck_versions')
  THEN
    DROP POLICY "Users can create deck versions" ON deck_versions;
  END IF;
END $$;


-- ============================================================================
-- 5. Drop duplicate policies on user_activity_logs
-- ============================================================================
-- user_activity_logs_own_data (FOR ALL) already covers SELECT,
-- so "Users can view their own activity" is redundant.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own activity' AND tablename = 'user_activity_logs')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_activity_logs_own_data' AND tablename = 'user_activity_logs')
  THEN
    DROP POLICY "Users can view their own activity" ON user_activity_logs;
  END IF;
END $$;


-- ============================================================================
-- 6. Drop duplicate policies on pricing_plans
-- ============================================================================
-- "Anyone can view plans" and "anyone_view_plans" are the same

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view plans' AND tablename = 'pricing_plans')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_view_plans' AND tablename = 'pricing_plans')
  THEN
    DROP POLICY "Anyone can view plans" ON pricing_plans;
  END IF;
END $$;


-- ============================================================================
-- 7. Drop duplicate indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_decks_created_at_desc;
DROP INDEX IF EXISTS palettes_category_idx;
