-- 016_analytics.sql
-- Presentation analytics tables for view tracking and slide engagement

-- Presentation view events (detailed tracking)
CREATE TABLE IF NOT EXISTS public.presentation_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_uuid UUID NOT NULL,
    viewer_id UUID,
    session_id TEXT,
    source TEXT DEFAULT 'direct',  -- direct, social, embed, search
    platform TEXT,  -- linkedin, twitter, whatsapp, etc.
    device_type TEXT DEFAULT 'desktop',  -- desktop, mobile, tablet
    country TEXT,
    city TEXT,
    slide_index INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Slide-level engagement
CREATE TABLE IF NOT EXISTS public.slide_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_uuid UUID NOT NULL,
    slide_index INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    time_spent_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pv_deck ON public.presentation_views(deck_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_deck_date ON public.presentation_views(deck_uuid, created_at);
CREATE INDEX IF NOT EXISTS idx_pv_session ON public.presentation_views(session_id);
CREATE INDEX IF NOT EXISTS idx_se_deck ON public.slide_engagement(deck_uuid, slide_index);
CREATE INDEX IF NOT EXISTS idx_se_session ON public.slide_engagement(session_id);

-- Row Level Security
ALTER TABLE public.presentation_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slide_engagement ENABLE ROW LEVEL SECURITY;

-- Service role policies (backend uses service role key)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'presentation_views' AND policyname = 'Service role manage views'
    ) THEN
        CREATE POLICY "Service role manage views" ON public.presentation_views FOR ALL USING (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'slide_engagement' AND policyname = 'Service role manage engagement'
    ) THEN
        CREATE POLICY "Service role manage engagement" ON public.slide_engagement FOR ALL USING (auth.role() = 'service_role');
    END IF;
END
$$;
