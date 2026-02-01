-- ============================================================================
-- Migration 033: Merge Overlapping Permissive Policies
-- ============================================================================
-- Fixes remaining "Multiple Permissive Policies" warnings by merging pairs
-- of permissive policies on the same table/action into single policies
-- that OR the conditions together.
-- ============================================================================


-- ============================================================================
-- 1. user_badges: "Anyone can view badges" USING(true) makes
--    "Users view own badges" redundant on SELECT
-- ============================================================================

DROP POLICY IF EXISTS "Users view own badges" ON user_badges;


-- ============================================================================
-- 2. community_decks: merge two SELECT policies into one
--    "Anyone can view approved community decks" USING(status='approved')
--    "Users can view their own submissions" USING(auth.uid()=user_id)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view approved community decks' AND tablename = 'community_decks')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own submissions' AND tablename = 'community_decks')
  THEN
    DROP POLICY "Anyone can view approved community decks" ON community_decks;
    DROP POLICY "Users can view their own submissions" ON community_decks;
    CREATE POLICY "View approved or own submissions" ON community_decks
      FOR SELECT USING (
        status = 'approved' OR (select auth.uid()) = user_id
      );
  END IF;
END $$;


-- ============================================================================
-- 3. invitations: merge sent + received into one SELECT policy
--    "users_view_sent_invitations" USING(sender_id=auth.uid())
--    "users_view_received_invitations" USING(recipient_id=auth.uid())
-- ============================================================================

DO $$
DECLARE
  sent_qual TEXT;
  recv_qual TEXT;
BEGIN
  SELECT qual INTO sent_qual FROM pg_policies
    WHERE policyname = 'users_view_sent_invitations' AND tablename = 'invitations';
  SELECT qual INTO recv_qual FROM pg_policies
    WHERE policyname = 'users_view_received_invitations' AND tablename = 'invitations';

  IF sent_qual IS NOT NULL AND recv_qual IS NOT NULL THEN
    -- Replace bare auth calls with (select ...) in the merged expression
    sent_qual := replace(sent_qual, 'auth.uid()', '(select auth.uid())');
    recv_qual := replace(recv_qual, 'auth.uid()', '(select auth.uid())');

    DROP POLICY "users_view_sent_invitations" ON invitations;
    DROP POLICY "users_view_received_invitations" ON invitations;

    EXECUTE format(
      'CREATE POLICY "users_view_own_invitations" ON invitations FOR SELECT USING ((%s) OR (%s))',
      sent_qual, recv_qual
    );
  END IF;
END $$;


-- ============================================================================
-- 4. deck_collaborators: merge two SELECT policies into one
--    "collab_own_entries" and "collab_view_own"
-- ============================================================================

DO $$
DECLARE
  qual1 TEXT;
  qual2 TEXT;
BEGIN
  SELECT qual INTO qual1 FROM pg_policies
    WHERE policyname = 'collab_own_entries' AND tablename = 'deck_collaborators';
  SELECT qual INTO qual2 FROM pg_policies
    WHERE policyname = 'collab_view_own' AND tablename = 'deck_collaborators';

  IF qual1 IS NOT NULL AND qual2 IS NOT NULL THEN
    qual1 := replace(qual1, 'auth.uid()', '(select auth.uid())');
    qual2 := replace(qual2, 'auth.uid()', '(select auth.uid())');

    DROP POLICY "collab_own_entries" ON deck_collaborators;
    DROP POLICY "collab_view_own" ON deck_collaborators;

    EXECUTE format(
      'CREATE POLICY "collab_view_own_entries" ON deck_collaborators FOR SELECT USING ((%s) OR (%s))',
      qual1, qual2
    );
  END IF;
END $$;


-- ============================================================================
-- 5. decks SELECT: merge 3 policies into 1
--    "anonymous_decks_select", "shared_decks_select_fixed", "user_own_decks"
--    user_own_decks is FOR ALL so it covers SELECT — we need to handle this
--    by splitting it into non-SELECT + a merged SELECT policy.
-- ============================================================================

DO $$
DECLARE
  anon_qual TEXT;
  shared_qual TEXT;
  own_qual TEXT;
  own_check TEXT;
BEGIN
  SELECT qual INTO anon_qual FROM pg_policies
    WHERE policyname = 'anonymous_decks_select' AND tablename = 'decks';
  SELECT qual INTO shared_qual FROM pg_policies
    WHERE policyname = 'shared_decks_select_fixed' AND tablename = 'decks';
  SELECT qual, with_check INTO own_qual, own_check FROM pg_policies
    WHERE policyname = 'user_own_decks' AND tablename = 'decks';

  IF anon_qual IS NOT NULL AND shared_qual IS NOT NULL AND own_qual IS NOT NULL THEN
    -- Fix auth calls
    anon_qual := replace(anon_qual, 'auth.uid()', '(select auth.uid())');
    shared_qual := replace(shared_qual, 'auth.uid()', '(select auth.uid())');
    own_qual := replace(own_qual, 'auth.uid()', '(select auth.uid())');
    IF own_check IS NOT NULL THEN
      own_check := replace(own_check, 'auth.uid()', '(select auth.uid())');
    END IF;

    -- Drop overlapping policies
    DROP POLICY "anonymous_decks_select" ON decks;
    DROP POLICY "shared_decks_select_fixed" ON decks;
    DROP POLICY "user_own_decks" ON decks;

    -- Merged SELECT: own OR anonymous OR shared
    EXECUTE format(
      'CREATE POLICY "decks_select" ON decks FOR SELECT USING ((%s) OR (%s) OR (%s))',
      own_qual, anon_qual, shared_qual
    );

    -- Recreate owner policy for INSERT/UPDATE/DELETE only
    IF own_check IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY "user_own_decks_modify" ON decks FOR INSERT WITH CHECK (%s)',
        own_check
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY "user_own_decks_modify" ON decks FOR INSERT WITH CHECK (%s)',
        own_qual
      );
    END IF;

    EXECUTE format(
      'CREATE POLICY "user_own_decks_update" ON decks FOR UPDATE USING (%s)',
      own_qual
    );

    EXECUTE format(
      'CREATE POLICY "user_own_decks_delete" ON decks FOR DELETE USING (%s)',
      own_qual
    );
  END IF;
END $$;

-- Also merge the INSERT overlap: anonymous_decks_insert + user_own_decks_modify
DO $$
DECLARE
  anon_check TEXT;
  own_check TEXT;
BEGIN
  SELECT with_check INTO anon_check FROM pg_policies
    WHERE policyname = 'anonymous_decks_insert' AND tablename = 'decks';
  SELECT with_check INTO own_check FROM pg_policies
    WHERE policyname = 'user_own_decks_modify' AND tablename = 'decks';

  IF anon_check IS NOT NULL AND own_check IS NOT NULL THEN
    anon_check := replace(anon_check, 'auth.uid()', '(select auth.uid())');

    DROP POLICY "anonymous_decks_insert" ON decks;
    DROP POLICY "user_own_decks_modify" ON decks;

    EXECUTE format(
      'CREATE POLICY "decks_insert" ON decks FOR INSERT WITH CHECK ((%s) OR (%s))',
      own_check, anon_check
    );
  END IF;
END $$;


-- ============================================================================
-- 6. user_activity_logs: user_activity_logs_own_data (FOR ALL) overlaps
--    with user_activity_logs_admin_access (SELECT) on SELECT.
--    Merge into a single SELECT + keep separate INSERT/UPDATE/DELETE for owner.
-- ============================================================================

DO $$
DECLARE
  own_qual TEXT;
  admin_qual TEXT;
BEGIN
  SELECT qual INTO own_qual FROM pg_policies
    WHERE policyname = 'user_activity_logs_own_data' AND tablename = 'user_activity_logs';
  SELECT qual INTO admin_qual FROM pg_policies
    WHERE policyname = 'user_activity_logs_admin_access' AND tablename = 'user_activity_logs';

  IF own_qual IS NOT NULL AND admin_qual IS NOT NULL THEN
    own_qual := replace(own_qual, 'auth.uid()', '(select auth.uid())');
    admin_qual := replace(admin_qual, 'auth.uid()', '(select auth.uid())');

    DROP POLICY "user_activity_logs_own_data" ON user_activity_logs;
    DROP POLICY "user_activity_logs_admin_access" ON user_activity_logs;

    -- Merged SELECT: own data OR admin
    EXECUTE format(
      'CREATE POLICY "user_activity_logs_select" ON user_activity_logs FOR SELECT USING ((%s) OR (%s))',
      own_qual, admin_qual
    );

    -- Owner can still INSERT/UPDATE/DELETE own data
    EXECUTE format(
      'CREATE POLICY "user_activity_logs_modify" ON user_activity_logs FOR INSERT WITH CHECK (%s)',
      own_qual
    );
    EXECUTE format(
      'CREATE POLICY "user_activity_logs_update" ON user_activity_logs FOR UPDATE USING (%s)',
      own_qual
    );
    EXECUTE format(
      'CREATE POLICY "user_activity_logs_delete" ON user_activity_logs FOR DELETE USING (%s)',
      own_qual
    );
  END IF;
END $$;


-- ============================================================================
-- 7. published_webpages: "Anyone can read published webpages" (SELECT, true)
--    overlaps with "Users can manage own webpages" (ALL, uid=user_id).
--    Split the FOR ALL into specific actions to avoid SELECT overlap.
-- ============================================================================

DO $$
DECLARE
  own_qual TEXT;
  own_check TEXT;
BEGIN
  SELECT qual, with_check INTO own_qual, own_check FROM pg_policies
    WHERE policyname = 'Users can manage own webpages' AND tablename = 'published_webpages';

  IF own_qual IS NOT NULL THEN
    own_qual := replace(own_qual, 'auth.uid()', '(select auth.uid())');
    IF own_check IS NOT NULL THEN
      own_check := replace(own_check, 'auth.uid()', '(select auth.uid())');
    END IF;

    DROP POLICY "Users can manage own webpages" ON published_webpages;

    -- The public SELECT policy already covers reading. Only need owner
    -- policies for write operations.
    EXECUTE format(
      'CREATE POLICY "Users can create own webpages" ON published_webpages FOR INSERT WITH CHECK (%s)',
      COALESCE(own_check, own_qual)
    );
    EXECUTE format(
      'CREATE POLICY "Users can update own webpages" ON published_webpages FOR UPDATE USING (%s)',
      own_qual
    );
    EXECUTE format(
      'CREATE POLICY "Users can delete own webpages" ON published_webpages FOR DELETE USING (%s)',
      own_qual
    );
  END IF;
END $$;
