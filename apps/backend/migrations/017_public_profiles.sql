-- 017_public_profiles.sql
-- Public profiles and creator pages: user profiles, follows, profile views

-- Add profile columns to existing users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_profile_public BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS creator_tier TEXT DEFAULT 'none';

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_profile_public ON public.users(is_profile_public) WHERE is_profile_public = true;

-- User follows table
CREATE TABLE IF NOT EXISTS public.user_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.user_follows(following_id);

-- Profile views table for tracking
CREATE TABLE IF NOT EXISTS public.profile_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    viewer_id UUID,
    viewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_views_user ON public.profile_views(profile_user_id, viewed_at DESC);

-- Row Level Security
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
    -- user_follows: anyone can read follows
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'Anyone can read follows'
    ) THEN
        CREATE POLICY "Anyone can read follows" ON public.user_follows FOR SELECT USING (true);
    END IF;

    -- user_follows: authenticated users can insert their own follows
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'Users can follow others'
    ) THEN
        CREATE POLICY "Users can follow others" ON public.user_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
    END IF;

    -- user_follows: users can delete their own follows
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'Users can unfollow'
    ) THEN
        CREATE POLICY "Users can unfollow" ON public.user_follows FOR DELETE USING (auth.uid() = follower_id);
    END IF;

    -- profile_views: service role can manage views
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'profile_views' AND policyname = 'Service role manage profile views'
    ) THEN
        CREATE POLICY "Service role manage profile views" ON public.profile_views FOR ALL USING (auth.role() = 'service_role');
    END IF;

    -- Service role policies for user_follows (backend uses service role key)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'Service role manage follows'
    ) THEN
        CREATE POLICY "Service role manage follows" ON public.user_follows FOR ALL USING (auth.role() = 'service_role');
    END IF;
END
$$;
