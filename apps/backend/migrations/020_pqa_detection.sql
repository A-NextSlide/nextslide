-- ============================================================================
-- Migration 020: PQA (Product Qualified Account) Detection
-- ============================================================================
-- Detects when 3+ users share the same email domain and flags them as
-- enterprise prospects.  Tracks upgrade prompt impressions and conversions.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. pqa_domains - one row per corporate email domain
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pqa_domains (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          TEXT        UNIQUE NOT NULL,          -- e.g. "acme.com"
    user_count      INTEGER     DEFAULT 0,
    total_decks     INTEGER     DEFAULT 0,
    total_views     INTEGER     DEFAULT 0,
    is_pqa          BOOLEAN     DEFAULT FALSE,            -- true when user_count >= 3
    first_detected_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    notified        BOOLEAN     DEFAULT FALSE,            -- have we shown prompts?
    metadata        JSONB       DEFAULT '{}'::jsonb
);

-- --------------------------------------------------------------------------
-- 2. pqa_upgrade_prompts - one row per prompt shown to a user
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pqa_upgrade_prompts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        REFERENCES auth.users(id),
    domain          TEXT        NOT NULL,
    prompt_type     TEXT        NOT NULL,                 -- e.g. 'pqa_team_detected', 'enterprise_feature_gate'
    shown_at        TIMESTAMPTZ DEFAULT NOW(),
    dismissed_at    TIMESTAMPTZ,
    converted_at    TIMESTAMPTZ,
    metadata        JSONB       DEFAULT '{}'::jsonb
);

-- --------------------------------------------------------------------------
-- 3. Indexes
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pqa_domains_domain   ON pqa_domains (domain);
CREATE INDEX IF NOT EXISTS idx_pqa_domains_is_pqa   ON pqa_domains (is_pqa);
CREATE INDEX IF NOT EXISTS idx_pqa_upgrade_prompts_user_id ON pqa_upgrade_prompts (user_id);

-- --------------------------------------------------------------------------
-- 4. Row-Level Security
-- --------------------------------------------------------------------------
ALTER TABLE pqa_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqa_upgrade_prompts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend)
CREATE POLICY pqa_domains_service_all ON pqa_domains
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY pqa_upgrade_prompts_service_all ON pqa_upgrade_prompts
    FOR ALL
    USING (true)
    WITH CHECK (true);
