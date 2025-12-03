-- Migration: Create share_viewers and share_view_events tables
-- Run this directly in Supabase SQL Editor

-- ============================================
-- 1. Create share_viewers table for email collection
-- ============================================
CREATE TABLE IF NOT EXISTS share_viewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES deck_shares(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    company VARCHAR(255),
    client_ip VARCHAR(45),
    user_agent TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: one email per share link
    CONSTRAINT unique_viewer_per_share UNIQUE (share_id, email)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_share_viewers_share_id ON share_viewers(share_id);
CREATE INDEX IF NOT EXISTS idx_share_viewers_email ON share_viewers(email);
CREATE INDEX IF NOT EXISTS idx_share_viewers_registered_at ON share_viewers(registered_at DESC);

-- Enable Row Level Security
ALTER TABLE share_viewers ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert (viewers registering themselves)
CREATE POLICY "Anyone can register as viewer" ON share_viewers
    FOR INSERT
    WITH CHECK (true);

-- Policy: Share owners can view their share's viewers
CREATE POLICY "Share owners can view viewers" ON share_viewers
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM deck_shares ds
            WHERE ds.id = share_viewers.share_id
            AND ds.created_by = auth.uid()
        )
    );

-- Grant permissions
GRANT INSERT ON share_viewers TO anon;
GRANT INSERT ON share_viewers TO authenticated;
GRANT SELECT ON share_viewers TO authenticated;

COMMENT ON TABLE share_viewers IS 'Tracks viewer emails collected from email-gated share links';


-- ============================================
-- 2. Create share_view_events table for detailed analytics
-- ============================================
CREATE TABLE IF NOT EXISTS share_view_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES deck_shares(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES share_viewers(id) ON DELETE SET NULL,
    session_id VARCHAR(64) NOT NULL,  -- Browser session identifier

    -- View details
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER DEFAULT 0,

    -- Slide tracking (JSON array of {slideIndex, timeSpentMs})
    slide_views JSONB DEFAULT '[]'::jsonb,
    slides_viewed INTEGER DEFAULT 0,

    -- Device info
    device_type VARCHAR(20),  -- desktop, mobile, tablet
    browser VARCHAR(50),
    os VARCHAR(50),

    -- Location (optional, from IP)
    country VARCHAR(100),
    city VARCHAR(100),

    -- Referrer
    referrer_url TEXT,
    referrer_source VARCHAR(50),  -- direct, email, social, etc.

    client_ip VARCHAR(45),
    user_agent TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_share_view_events_share_id ON share_view_events(share_id);
CREATE INDEX IF NOT EXISTS idx_share_view_events_started_at ON share_view_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_view_events_session_id ON share_view_events(session_id);

-- Enable Row Level Security
ALTER TABLE share_view_events ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert and update their own session
CREATE POLICY "Anyone can track views" ON share_view_events
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update their session" ON share_view_events
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Policy: Share owners can view events
CREATE POLICY "Share owners can view events" ON share_view_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM deck_shares ds
            WHERE ds.id = share_view_events.share_id
            AND ds.created_by = auth.uid()
        )
    );

-- Grant permissions
GRANT INSERT, UPDATE ON share_view_events TO anon;
GRANT INSERT, UPDATE ON share_view_events TO authenticated;
GRANT SELECT ON share_view_events TO authenticated;

COMMENT ON TABLE share_view_events IS 'Tracks detailed view analytics including slide-level engagement';
