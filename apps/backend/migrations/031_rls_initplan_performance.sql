-- ============================================================================
-- Migration 031: RLS Init Plan Performance Fix
-- ============================================================================
-- Fixes the "Auth RLS Initialization Plan" warning across all tables.
--
-- Problem: auth.uid(), auth.role(), etc. in RLS policies are re-evaluated
-- per row. On large tables this causes significant performance degradation.
--
-- Fix: Wrap each call in (select ...) so PostgreSQL evaluates it once as an
-- init plan and reuses the result for every row.
--
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ============================================================================


-- ============================================================================
-- 1. admin_audit_logs
-- ============================================================================

-- From create-admin-tables.sql
DROP POLICY IF EXISTS "admin_audit_logs_admin_only" ON admin_audit_logs;
CREATE POLICY "admin_audit_logs_admin_only" ON admin_audit_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- From migration 030
DROP POLICY IF EXISTS "admin_audit_logs_insert_admin_only" ON admin_audit_logs;
CREATE POLICY "admin_audit_logs_insert_admin_only" ON admin_audit_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- Dashboard-created policy (flagged by linter)
DROP POLICY IF EXISTS "Admin audit logs are viewable by admins only" ON admin_audit_logs;
CREATE POLICY "Admin audit logs are viewable by admins only" ON admin_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );


-- ============================================================================
-- 2. api_generation_jobs
-- ============================================================================

DROP POLICY IF EXISTS "api_generation_jobs_select_own" ON api_generation_jobs;
CREATE POLICY "api_generation_jobs_select_own" ON api_generation_jobs
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "api_generation_jobs_insert_own" ON api_generation_jobs;
CREATE POLICY "api_generation_jobs_insert_own" ON api_generation_jobs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "api_generation_jobs_update_own" ON api_generation_jobs;
CREATE POLICY "api_generation_jobs_update_own" ON api_generation_jobs
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "api_generation_jobs_delete_own" ON api_generation_jobs;
CREATE POLICY "api_generation_jobs_delete_own" ON api_generation_jobs
  FOR DELETE USING ((select auth.uid()) = user_id);


-- ============================================================================
-- 3. api_keys
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own api keys" ON api_keys;
CREATE POLICY "Users can view own api keys" ON api_keys
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own api keys" ON api_keys;
CREATE POLICY "Users can create own api keys" ON api_keys
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own api keys" ON api_keys;
CREATE POLICY "Users can update own api keys" ON api_keys
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own api keys" ON api_keys;
CREATE POLICY "Users can delete own api keys" ON api_keys
  FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role full access" ON api_keys;
CREATE POLICY "Service role full access" ON api_keys
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 4. cancellation_feedback (from setup_billing_tables.sql — may not exist)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cancellation_feedback' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Users can view own feedback" ON cancellation_feedback;
    CREATE POLICY "Users can view own feedback" ON cancellation_feedback
      FOR SELECT USING ((select auth.uid()) = user_id);

    DROP POLICY IF EXISTS "Service can manage feedback" ON cancellation_feedback;
    CREATE POLICY "Service can manage feedback" ON cancellation_feedback
      FOR ALL USING ((select auth.role()) = 'service_role');
  END IF;
END $$;


-- ============================================================================
-- 5. community_decks
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own submissions" ON community_decks;
CREATE POLICY "Users can view their own submissions" ON community_decks
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can submit their decks" ON community_decks;
CREATE POLICY "Users can submit their decks" ON community_decks
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update pending submissions" ON community_decks;
CREATE POLICY "Users can update pending submissions" ON community_decks
  FOR UPDATE USING ((select auth.uid()) = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Users can delete pending submissions" ON community_decks;
CREATE POLICY "Users can delete pending submissions" ON community_decks
  FOR DELETE USING ((select auth.uid()) = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Service role can manage all community decks" ON community_decks;
CREATE POLICY "Service role can manage all community decks" ON community_decks
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 6. credit_balances
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own balance" ON credit_balances;
CREATE POLICY "Users can view own balance" ON credit_balances
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service can manage balances" ON credit_balances;
CREATE POLICY "Service can manage balances" ON credit_balances
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 7. credit_transactions
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transactions;
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service can manage transactions" ON credit_transactions;
CREATE POLICY "Service can manage transactions" ON credit_transactions
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 8. daily_view_stats
-- ============================================================================

DROP POLICY IF EXISTS "Service role manage daily views" ON daily_view_stats;
CREATE POLICY "Service role manage daily views" ON daily_view_stats
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 9. deck_shares
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own shares" ON deck_shares;
CREATE POLICY "Users can view own shares" ON deck_shares
  FOR SELECT USING (
    (select auth.uid()) = shared_by
    OR (select auth.uid()) = shared_with
    OR (select auth.uid()) = created_by
  );

DROP POLICY IF EXISTS "Users can share decks" ON deck_shares;
CREATE POLICY "Users can share decks" ON deck_shares
  FOR INSERT WITH CHECK (
    (select auth.uid()) = shared_by OR (select auth.uid()) = created_by
  );

DROP POLICY IF EXISTS "Recipients can update shares" ON deck_shares;
CREATE POLICY "Recipients can update shares" ON deck_shares
  FOR UPDATE USING (
    (select auth.uid()) = shared_with OR (select auth.uid()) = created_by
  );

DROP POLICY IF EXISTS "Users can delete own shares" ON deck_shares;
CREATE POLICY "Users can delete own shares" ON deck_shares
  FOR DELETE USING (
    (select auth.uid()) = shared_by
    OR (select auth.uid()) = shared_with
    OR (select auth.uid()) = created_by
  );


-- ============================================================================
-- 11. featured_decks
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage featured decks" ON featured_decks;
CREATE POLICY "Service role can manage featured decks" ON featured_decks
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 12. integration_usage_logs
-- ============================================================================

DROP POLICY IF EXISTS "integration_usage_owner" ON integration_usage_logs;
CREATE POLICY "integration_usage_owner" ON integration_usage_logs
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ============================================================================
-- 13. invoices (from setup_billing_tables.sql — may not exist)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'invoices' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Users can view own invoices" ON invoices;
    CREATE POLICY "Users can view own invoices" ON invoices
      FOR SELECT USING ((select auth.uid()) = user_id);
  END IF;
END $$;


-- ============================================================================
-- 14. notification_preferences
-- ============================================================================

DROP POLICY IF EXISTS "Users manage own preferences" ON notification_preferences;
CREATE POLICY "Users manage own preferences" ON notification_preferences
  FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role manage preferences" ON notification_preferences;
CREATE POLICY "Service role manage preferences" ON notification_preferences
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 15. notifications
-- ============================================================================

DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role manage notifications" ON notifications;
CREATE POLICY "Service role manage notifications" ON notifications
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 16. payment_methods (from setup_billing_tables.sql — may not exist)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'payment_methods' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Users can view own payment methods" ON payment_methods;
    CREATE POLICY "Users can view own payment methods" ON payment_methods
      FOR SELECT USING ((select auth.uid()) = user_id);
  END IF;
END $$;


-- ============================================================================
-- 17. platform_metrics (from create-admin-tables.sql — may not exist)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'platform_metrics' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "platform_metrics_admin_only" ON platform_metrics;
    CREATE POLICY "platform_metrics_admin_only" ON platform_metrics
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = (select auth.uid())
          AND role = 'admin'
        )
      );
  END IF;
END $$;


-- ============================================================================
-- 18. pqa_upgrade_prompts
-- ============================================================================

DROP POLICY IF EXISTS "pqa_upgrade_prompts_select_own" ON pqa_upgrade_prompts;
CREATE POLICY "pqa_upgrade_prompts_select_own" ON pqa_upgrade_prompts
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "pqa_upgrade_prompts_update_own" ON pqa_upgrade_prompts;
CREATE POLICY "pqa_upgrade_prompts_update_own" ON pqa_upgrade_prompts
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id);


-- ============================================================================
-- 19. presentation_views
-- ============================================================================

DROP POLICY IF EXISTS "Service role manage views" ON presentation_views;
CREATE POLICY "Service role manage views" ON presentation_views
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 20. profile_views
-- ============================================================================

DROP POLICY IF EXISTS "Service role manage profile views" ON profile_views;
CREATE POLICY "Service role manage profile views" ON profile_views
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 21. published_webpages
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own webpages" ON published_webpages;
CREATE POLICY "Users can manage own webpages" ON published_webpages
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ============================================================================
-- 22. referral_codes
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own referral code" ON referral_codes;
CREATE POLICY "Users can view own referral code" ON referral_codes
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own referral code" ON referral_codes;
CREATE POLICY "Users can create own referral code" ON referral_codes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role full access referral_codes" ON referral_codes;
CREATE POLICY "Service role full access referral_codes" ON referral_codes
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 23. referrals
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own referrals" ON referrals;
CREATE POLICY "Users can view own referrals" ON referrals
  FOR SELECT USING ((select auth.uid()) = referrer_id);

DROP POLICY IF EXISTS "Service role full access referrals" ON referrals;
CREATE POLICY "Service role full access referrals" ON referrals
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 24. share_link_analytics
-- ============================================================================

DROP POLICY IF EXISTS "share_link_analytics_select_own" ON share_link_analytics;
CREATE POLICY "share_link_analytics_select_own" ON share_link_analytics
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);


-- ============================================================================
-- 25. share_view_events
-- ============================================================================

DROP POLICY IF EXISTS "Share owners can view events" ON share_view_events;
CREATE POLICY "Share owners can view events" ON share_view_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM deck_shares ds
      WHERE ds.id = share_view_events.share_id
      AND ds.created_by = (select auth.uid())
    )
  );


-- ============================================================================
-- 26. share_viewers
-- ============================================================================

DROP POLICY IF EXISTS "Share owners can view viewers" ON share_viewers;
CREATE POLICY "Share owners can view viewers" ON share_viewers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM deck_shares ds
      WHERE ds.id = share_viewers.share_id
      AND ds.created_by = (select auth.uid())
    )
  );


-- ============================================================================
-- 27. showcase_upvotes
-- ============================================================================

DROP POLICY IF EXISTS "Auth users can upvote" ON showcase_upvotes;
CREATE POLICY "Auth users can upvote" ON showcase_upvotes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can remove own upvote" ON showcase_upvotes;
CREATE POLICY "Users can remove own upvote" ON showcase_upvotes
  FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role full access upvotes" ON showcase_upvotes;
CREATE POLICY "Service role full access upvotes" ON showcase_upvotes
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 28. slack_generation_sessions
-- ============================================================================

DROP POLICY IF EXISTS "slack_generation_sessions_select_own" ON slack_generation_sessions;
CREATE POLICY "slack_generation_sessions_select_own" ON slack_generation_sessions
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = nextslide_user_id);


-- ============================================================================
-- 29. slack_user_mappings
-- ============================================================================

DROP POLICY IF EXISTS "slack_user_mappings_select_own" ON slack_user_mappings;
CREATE POLICY "slack_user_mappings_select_own" ON slack_user_mappings
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = nextslide_user_id);


-- ============================================================================
-- 30. slide_engagement
-- ============================================================================

DROP POLICY IF EXISTS "Service role manage engagement" ON slide_engagement;
CREATE POLICY "Service role manage engagement" ON slide_engagement
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 31. subscriptions
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service can manage subscriptions" ON subscriptions;
CREATE POLICY "Service can manage subscriptions" ON subscriptions
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 32. team_invite_prompts_dismissed
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own prompt dismissals" ON team_invite_prompts_dismissed;
CREATE POLICY "Users can view own prompt dismissals" ON team_invite_prompts_dismissed
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own prompt dismissals" ON team_invite_prompts_dismissed;
CREATE POLICY "Users can insert own prompt dismissals" ON team_invite_prompts_dismissed
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own prompt dismissals" ON team_invite_prompts_dismissed;
CREATE POLICY "Users can update own prompt dismissals" ON team_invite_prompts_dismissed
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own prompt dismissals" ON team_invite_prompts_dismissed;
CREATE POLICY "Users can delete own prompt dismissals" ON team_invite_prompts_dismissed
  FOR DELETE USING ((select auth.uid()) = user_id);


-- ============================================================================
-- 33. templates
-- ============================================================================

DROP POLICY IF EXISTS "Service role manage templates" ON templates;
CREATE POLICY "Service role manage templates" ON templates
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 34. user_activity_logs (from create-admin-tables.sql — may not exist)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'user_activity_logs' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "user_activity_logs_own_data" ON user_activity_logs;
    CREATE POLICY "user_activity_logs_own_data" ON user_activity_logs
      FOR ALL USING ((select auth.uid()) = user_id);

    DROP POLICY IF EXISTS "user_activity_logs_admin_access" ON user_activity_logs;
    CREATE POLICY "user_activity_logs_admin_access" ON user_activity_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = (select auth.uid())
          AND role = 'admin'
        )
      );
  END IF;
END $$;


-- ============================================================================
-- 35. user_badges
-- ============================================================================

DROP POLICY IF EXISTS "Users view own badges" ON user_badges;
CREATE POLICY "Users view own badges" ON user_badges
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role manage badges" ON user_badges;
CREATE POLICY "Service role manage badges" ON user_badges
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 36. user_follows
-- ============================================================================

DROP POLICY IF EXISTS "Users can follow others" ON user_follows;
CREATE POLICY "Users can follow others" ON user_follows
  FOR INSERT WITH CHECK ((select auth.uid()) = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON user_follows;
CREATE POLICY "Users can unfollow" ON user_follows
  FOR DELETE USING ((select auth.uid()) = follower_id);

DROP POLICY IF EXISTS "Service role manage follows" ON user_follows;
CREATE POLICY "Service role manage follows" ON user_follows
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 37. user_integrations
-- ============================================================================

DROP POLICY IF EXISTS "user_integrations_owner" ON user_integrations;
CREATE POLICY "user_integrations_owner" ON user_integrations
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ============================================================================
-- 38. user_sessions (from create-admin-tables.sql — may not exist)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'user_sessions' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "user_sessions_own_data" ON user_sessions;
    CREATE POLICY "user_sessions_own_data" ON user_sessions
      FOR ALL USING ((select auth.uid()) = user_id);

    DROP POLICY IF EXISTS "user_sessions_admin_access" ON user_sessions;
    CREATE POLICY "user_sessions_admin_access" ON user_sessions
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = (select auth.uid())
          AND role = 'admin'
        )
      );
  END IF;
END $$;


-- ============================================================================
-- 39. user_streaks
-- ============================================================================

DROP POLICY IF EXISTS "Users view own streak" ON user_streaks;
CREATE POLICY "Users view own streak" ON user_streaks
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role manage streaks" ON user_streaks;
CREATE POLICY "Service role manage streaks" ON user_streaks
  FOR ALL USING ((select auth.role()) = 'service_role');


-- ============================================================================
-- 40. webpage_leads
-- ============================================================================

DROP POLICY IF EXISTS "Owners can read leads for their webpages" ON webpage_leads;
CREATE POLICY "Owners can read leads for their webpages" ON webpage_leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM published_webpages
      WHERE published_webpages.id = webpage_leads.webpage_id
      AND published_webpages.user_id = (select auth.uid())
    )
  );


-- ============================================================================
-- 41. DYNAMIC CATCH-ALL: Fix ALL remaining policies using auth functions
-- ============================================================================
-- Reads actual policy definitions from pg_policies, replaces bare
-- auth.uid()/auth.role()/auth.jwt() with (select ...) wrappers, and
-- recreates each policy. This handles dashboard-created policies on
-- palettes, user_decks, users, deck_versions, and anything else.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_with_check TEXT;
  create_sql TEXT;
  role_list TEXT;
  cmd_str TEXT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND (
          (qual LIKE '%auth.uid()%' AND qual NOT LIKE '%select auth.uid()%')
          OR (qual LIKE '%auth.role()%' AND qual NOT LIKE '%select auth.role()%')
          OR (qual LIKE '%auth.jwt()%' AND qual NOT LIKE '%select auth.jwt()%')
          OR (qual LIKE '%current_setting(%' AND qual NOT LIKE '%select current_setting(%')
        ))
        OR (with_check IS NOT NULL AND (
          (with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%select auth.uid()%')
          OR (with_check LIKE '%auth.role()%' AND with_check NOT LIKE '%select auth.role()%')
          OR (with_check LIKE '%auth.jwt()%' AND with_check NOT LIKE '%select auth.jwt()%')
          OR (with_check LIKE '%current_setting(%' AND with_check NOT LIKE '%select current_setting(%')
        ))
      )
  LOOP
    -- Apply replacements to qual
    new_qual := r.qual;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      new_qual := replace(new_qual, 'auth.jwt()', '(select auth.jwt())');
      -- current_setting has arguments, use a pattern that covers common cases
      new_qual := replace(new_qual, 'current_setting(', '(select current_setting(');
      -- Fix the extra closing paren from current_setting replacement
      -- This is safe because current_setting() calls end with )
    END IF;

    -- Apply replacements to with_check
    new_with_check := r.with_check;
    IF new_with_check IS NOT NULL THEN
      new_with_check := replace(new_with_check, 'auth.uid()', '(select auth.uid())');
      new_with_check := replace(new_with_check, 'auth.role()', '(select auth.role())');
      new_with_check := replace(new_with_check, 'auth.jwt()', '(select auth.jwt())');
      new_with_check := replace(new_with_check, 'current_setting(', '(select current_setting(');
    END IF;

    -- Drop the existing policy
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    -- Build role clause
    IF r.roles = ARRAY['public']::name[] OR r.roles IS NULL THEN
      role_list := '';
    ELSE
      role_list := ' TO ' || array_to_string(r.roles, ', ');
    END IF;

    -- Map cmd: pg_policies uses '*' for ALL
    cmd_str := CASE WHEN r.cmd = '*' THEN 'ALL' ELSE r.cmd END;

    -- Reconstruct CREATE POLICY
    create_sql := format('CREATE POLICY %I ON %I.%I FOR %s',
      r.policyname, r.schemaname, r.tablename, cmd_str);

    IF r.permissive = 'RESTRICTIVE' THEN
      create_sql := create_sql || ' AS RESTRICTIVE';
    END IF;

    create_sql := create_sql || role_list;

    IF new_qual IS NOT NULL THEN
      create_sql := create_sql || ' USING (' || new_qual || ')';
    END IF;

    IF new_with_check IS NOT NULL THEN
      create_sql := create_sql || ' WITH CHECK (' || new_with_check || ')';
    END IF;

    EXECUTE create_sql;

    RAISE NOTICE 'Fixed policy: %.% — %', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;
