-- Migration: Create showcase upvotes table and enhance community_decks for showcase gallery
-- Adds upvoting, featured decks, and better sorting support

-- Upvotes table
CREATE TABLE IF NOT EXISTS public.showcase_upvotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_deck_id UUID NOT NULL REFERENCES public.community_decks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_upvote UNIQUE (community_deck_id, user_id)
);

-- Add upvote_count to community_decks
ALTER TABLE public.community_decks ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0;

-- Add featured flag
ALTER TABLE public.community_decks ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_upvotes_deck ON public.showcase_upvotes(community_deck_id);
CREATE INDEX IF NOT EXISTS idx_upvotes_user ON public.showcase_upvotes(user_id);
CREATE INDEX IF NOT EXISTS idx_community_featured ON public.community_decks(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_community_upvote_count ON public.community_decks(upvote_count DESC) WHERE status = 'approved';

-- RLS
ALTER TABLE public.showcase_upvotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view upvotes" ON public.showcase_upvotes
    FOR SELECT USING (true);

CREATE POLICY "Auth users can upvote" ON public.showcase_upvotes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own upvote" ON public.showcase_upvotes
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access upvotes" ON public.showcase_upvotes
    FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT SELECT, INSERT, DELETE ON public.showcase_upvotes TO authenticated;
GRANT SELECT ON public.showcase_upvotes TO anon;
