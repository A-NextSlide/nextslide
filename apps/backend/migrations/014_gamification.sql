-- Gamification: Achievement badges and streaks
-- Migration 014

-- Achievement badges
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_type TEXT NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    credits_awarded INTEGER DEFAULT 0,
    CONSTRAINT unique_user_badge UNIQUE (user_id, badge_type)
);

-- Streaks
CREATE TABLE IF NOT EXISTS public.user_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    streak_credits_claimed JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_type ON public.user_badges(badge_type);

-- RLS
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

-- Policies for user_badges
DO $$ BEGIN
    CREATE POLICY "Users view own badges" ON public.user_badges FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Service role manage badges" ON public.user_badges FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Anyone can view badges" ON public.user_badges FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Policies for user_streaks
DO $$ BEGIN
    CREATE POLICY "Users view own streak" ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Service role manage streaks" ON public.user_streaks FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grants
GRANT SELECT ON public.user_badges TO authenticated;
GRANT SELECT ON public.user_badges TO anon;
GRANT SELECT ON public.user_streaks TO authenticated;
