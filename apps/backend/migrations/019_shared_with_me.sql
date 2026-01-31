-- Migration 019: Shared With Me + Team Invite Prompts
-- Adds deck sharing between users and smart team-invite prompt dismissal tracking.
--
-- NOTE: deck_shares serves BOTH link-sharing (short_code, share_type, created_by)
-- and user-to-user sharing (shared_by, shared_with, permission).  All columns
-- are nullable except deck_uuid so that each insert path only fills its own fields.

-- ============================================================================
-- 1. deck_shares - tracks decks shared via links AND between users
-- ============================================================================

CREATE TABLE IF NOT EXISTS deck_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_uuid UUID NOT NULL,

    -- Link-sharing columns (deck_sharing_service)
    short_code TEXT UNIQUE,
    share_type TEXT DEFAULT 'view',
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    access_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    metadata JSONB,

    -- User-to-user sharing columns (sharing_service)
    shared_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    shared_with UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    permission TEXT DEFAULT 'view' CHECK (permission IS NULL OR permission IN ('view', 'edit')),
    message TEXT,
    is_read BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- User-sharing uniqueness: one share per deck+recipient pair
    UNIQUE(deck_uuid, shared_with)
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_deck_shares_shared_with ON deck_shares(shared_with, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_shares_shared_by ON deck_shares(shared_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_shares_deck_uuid ON deck_shares(deck_uuid);
CREATE INDEX IF NOT EXISTS idx_deck_shares_short_code ON deck_shares(short_code) WHERE short_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deck_shares_created_by ON deck_shares(created_by, created_at DESC);

-- RLS
ALTER TABLE deck_shares ENABLE ROW LEVEL SECURITY;

-- Users can see shares they sent, received, or created (link-sharing)
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

-- Users can insert shares they send or link-shares they create
DO $$ BEGIN
CREATE POLICY "Users can share decks"
    ON deck_shares FOR INSERT
    WITH CHECK (auth.uid() = shared_by OR auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update shares they received or link-shares they created
DO $$ BEGIN
CREATE POLICY "Recipients can update shares"
    ON deck_shares FOR UPDATE
    USING (auth.uid() = shared_with OR auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sharers/creators can delete shares they created, recipients can remove shares they received
DO $$ BEGIN
CREATE POLICY "Users can delete own shares"
    ON deck_shares FOR DELETE
    USING (auth.uid() = shared_by OR auth.uid() = shared_with OR auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 2. team_invite_prompts_dismissed - tracks dismissed invite prompts
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_invite_prompts_dismissed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt_type TEXT NOT NULL,
    dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    show_again_after TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    UNIQUE(user_id, prompt_type)
);

CREATE INDEX IF NOT EXISTS idx_team_invite_prompts_user ON team_invite_prompts_dismissed(user_id);

-- RLS
ALTER TABLE team_invite_prompts_dismissed ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY "Users can view own prompt dismissals"
    ON team_invite_prompts_dismissed FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can insert own prompt dismissals"
    ON team_invite_prompts_dismissed FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can update own prompt dismissals"
    ON team_invite_prompts_dismissed FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "Users can delete own prompt dismissals"
    ON team_invite_prompts_dismissed FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
