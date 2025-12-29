-- Migration: Create community_decks table for community slides feature
-- Users can submit their decks to the community, admins approve them,
-- and anyone can browse/remix approved community decks

-- Create the community_decks table
CREATE TABLE IF NOT EXISTS public.community_decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    deck_uuid UUID NOT NULL REFERENCES public.decks(uuid) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Community metadata
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('business', 'education', 'marketing', 'creative', 'technology', 'personal')),
    tags TEXT[] DEFAULT '{}',

    -- Approval workflow
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Stats
    remix_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,

    -- Cached deck data (snapshot at approval time for public display)
    slide_count INTEGER DEFAULT 0,
    first_slide JSONB,
    slides_snapshot JSONB,
    theme_snapshot JSONB,

    -- Author info (cached for display without joins)
    author_name TEXT,
    author_email TEXT,

    -- Timestamps
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one submission per deck
    CONSTRAINT unique_deck_submission UNIQUE (deck_uuid)
);

-- Indexes for common queries
CREATE INDEX idx_community_decks_status ON public.community_decks(status);
CREATE INDEX idx_community_decks_category ON public.community_decks(category);
CREATE INDEX idx_community_decks_approved ON public.community_decks(status, approved_at DESC) WHERE status = 'approved';
CREATE INDEX idx_community_decks_user ON public.community_decks(user_id);
CREATE INDEX idx_community_decks_tags ON public.community_decks USING GIN(tags);

-- Full-text search index for title and description
CREATE INDEX idx_community_decks_search ON public.community_decks
    USING GIN(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Enable RLS
ALTER TABLE public.community_decks ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- 1. Anyone can view approved community decks (public access, no auth required)
CREATE POLICY "Anyone can view approved community decks"
    ON public.community_decks
    FOR SELECT
    USING (status = 'approved');

-- 2. Authenticated users can view their own submissions (any status)
CREATE POLICY "Users can view their own submissions"
    ON public.community_decks
    FOR SELECT
    USING (auth.uid() = user_id);

-- 3. Authenticated users can submit their decks to the community
CREATE POLICY "Users can submit their decks"
    ON public.community_decks
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 4. Users can update their pending submissions only
CREATE POLICY "Users can update pending submissions"
    ON public.community_decks
    FOR UPDATE
    USING (auth.uid() = user_id AND status = 'pending');

-- 5. Users can delete/withdraw their pending submissions
CREATE POLICY "Users can delete pending submissions"
    ON public.community_decks
    FOR DELETE
    USING (auth.uid() = user_id AND status = 'pending');

-- 6. Service role has full access (for admin operations)
CREATE POLICY "Service role can manage all community decks"
    ON public.community_decks
    FOR ALL
    USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON public.community_decks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_decks TO authenticated;

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_community_decks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_community_decks_updated_at
    BEFORE UPDATE ON public.community_decks
    FOR EACH ROW
    EXECUTE FUNCTION update_community_decks_updated_at();
