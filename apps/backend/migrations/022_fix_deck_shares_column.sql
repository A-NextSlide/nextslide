-- Migration 022: Fix deck_shares schema
--
-- Migration 019 originally created deck_shares with only user-sharing columns
-- (deck_id, shared_by, shared_with, permission, message, is_read) but the
-- codebase also needs link-sharing columns (short_code, share_type, created_by,
-- is_active, access_count, etc.).  This migration reconciles the two.
--
-- Safe to run on any state of the table — every statement is idempotent.

-- ============================================================================
-- 1. Rename deck_id → deck_uuid if migration 019 created the table
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'deck_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'deck_uuid'
    ) THEN
        ALTER TABLE deck_shares RENAME COLUMN deck_id TO deck_uuid;
        RAISE NOTICE 'Renamed deck_shares.deck_id → deck_uuid';
    END IF;
END $$;

-- Fix the index name too
DROP INDEX IF EXISTS idx_deck_shares_deck_id;
CREATE INDEX IF NOT EXISTS idx_deck_shares_deck_uuid ON deck_shares(deck_uuid);

-- ============================================================================
-- 2. Add missing link-sharing columns
-- ============================================================================
DO $$
BEGIN
    -- short_code
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'short_code'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN short_code TEXT UNIQUE;
        RAISE NOTICE 'Added column short_code';
    END IF;

    -- share_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'share_type'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN share_type TEXT DEFAULT 'view';
        RAISE NOTICE 'Added column share_type';
    END IF;

    -- created_by
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added column created_by';
    END IF;

    -- is_active
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added column is_active';
    END IF;

    -- is_public
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'is_public'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN is_public BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added column is_public';
    END IF;

    -- access_count
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'access_count'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN access_count INTEGER DEFAULT 0;
        RAISE NOTICE 'Added column access_count';
    END IF;

    -- expires_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN expires_at TIMESTAMPTZ;
        RAISE NOTICE 'Added column expires_at';
    END IF;

    -- last_accessed_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'last_accessed_at'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN last_accessed_at TIMESTAMPTZ;
        RAISE NOTICE 'Added column last_accessed_at';
    END IF;

    -- metadata
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN metadata JSONB;
        RAISE NOTICE 'Added column metadata';
    END IF;
END $$;

-- ============================================================================
-- 3. Add missing user-sharing columns (in case table was created externally
--    with only link-sharing columns)
-- ============================================================================
DO $$
BEGIN
    -- shared_by
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'shared_by'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN shared_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added column shared_by';
    END IF;

    -- shared_with
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'shared_with'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN shared_with UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added column shared_with';
    END IF;

    -- permission
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'permission'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN permission TEXT DEFAULT 'view';
        RAISE NOTICE 'Added column permission';
    END IF;

    -- message
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'message'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN message TEXT;
        RAISE NOTICE 'Added column message';
    END IF;

    -- is_read
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deck_shares' AND column_name = 'is_read'
    ) THEN
        ALTER TABLE deck_shares ADD COLUMN is_read BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added column is_read';
    END IF;
END $$;

-- ============================================================================
-- 4. Ensure all indexes exist
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_deck_shares_shared_with ON deck_shares(shared_with, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_shares_shared_by ON deck_shares(shared_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_shares_short_code ON deck_shares(short_code) WHERE short_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deck_shares_created_by ON deck_shares(created_by, created_at DESC);

-- ============================================================================
-- 5. Update RLS policies to cover both sharing models
-- ============================================================================

-- Drop old narrow policies and replace with broader ones
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view own shares" ON deck_shares;
    DROP POLICY IF EXISTS "Users can share decks" ON deck_shares;
    DROP POLICY IF EXISTS "Recipients can update shares" ON deck_shares;
    DROP POLICY IF EXISTS "Users can delete own shares" ON deck_shares;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can view own shares"
    ON deck_shares FOR SELECT
    USING (
        auth.uid() = shared_by
        OR auth.uid() = shared_with
        OR auth.uid() = created_by
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can share decks"
    ON deck_shares FOR INSERT
    WITH CHECK (auth.uid() = shared_by OR auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Recipients can update shares"
    ON deck_shares FOR UPDATE
    USING (auth.uid() = shared_with OR auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can delete own shares"
    ON deck_shares FOR DELETE
    USING (auth.uid() = shared_by OR auth.uid() = shared_with OR auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
