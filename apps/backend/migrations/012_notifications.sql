-- Migration 012: Notifications system
-- Adds tables for in-app notifications, notification preferences, and daily view stats

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('view', 'remix', 'badge', 'referral', 'system')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email_on_views BOOLEAN DEFAULT true,
    email_weekly_digest BOOLEAN DEFAULT true,
    email_on_badges BOOLEAN DEFAULT true,
    in_app_notifications BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- View aggregation (for daily view summaries)
CREATE TABLE IF NOT EXISTS public.daily_view_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_uuid UUID NOT NULL REFERENCES public.decks(uuid) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    view_date DATE NOT NULL DEFAULT CURRENT_DATE,
    view_count INTEGER DEFAULT 0,
    CONSTRAINT unique_daily_view UNIQUE (deck_uuid, view_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_daily_views_user ON public.daily_view_stats(user_id, view_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_views_deck ON public.daily_view_stats(deck_uuid, view_date DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_view_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manage notifications" ON public.notifications FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users manage own preferences" ON public.notification_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manage preferences" ON public.notification_preferences FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manage daily views" ON public.daily_view_stats FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
