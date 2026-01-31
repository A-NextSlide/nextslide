-- Migration 018: Webpage Publishing
-- Allows users to publish presentations as scrollable single-page websites

-- ============================================================================
-- Published Webpages Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS published_webpages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id UUID NOT NULL REFERENCES decks(uuid) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    slides_data JSONB NOT NULL,
    settings JSONB DEFAULT '{}',
    is_published BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    lead_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_published_webpages_slug ON published_webpages(slug);
CREATE INDEX IF NOT EXISTS idx_published_webpages_user_id ON published_webpages(user_id);
CREATE INDEX IF NOT EXISTS idx_published_webpages_deck_id ON published_webpages(deck_id);

-- ============================================================================
-- Webpage Leads Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS webpage_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webpage_id UUID NOT NULL REFERENCES published_webpages(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webpage_leads_webpage_id ON webpage_leads(webpage_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE published_webpages ENABLE ROW LEVEL SECURITY;
ALTER TABLE webpage_leads ENABLE ROW LEVEL SECURITY;

-- Owners can CRUD their own webpages
CREATE POLICY "Users can manage own webpages"
    ON published_webpages
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Anyone can read published webpages (public access for viewers)
CREATE POLICY "Anyone can read published webpages"
    ON published_webpages
    FOR SELECT
    USING (is_published = true);

-- Anyone can insert leads (public visitors submitting their email)
CREATE POLICY "Anyone can insert leads"
    ON webpage_leads
    FOR INSERT
    WITH CHECK (true);

-- Webpage owners can read leads for their webpages
CREATE POLICY "Owners can read leads for their webpages"
    ON webpage_leads
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM published_webpages
            WHERE published_webpages.id = webpage_leads.webpage_id
            AND published_webpages.user_id = auth.uid()
        )
    );
