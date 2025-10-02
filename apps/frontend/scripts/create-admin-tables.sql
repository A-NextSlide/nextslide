-- Admin Dashboard Tables Creation Script
-- This script creates only the missing tables needed for the admin dashboard
-- It assumes you already have the 'users' table as described

-- First, let's check what tables already exist
-- Run this query first to see existing tables:
/*
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
*/

-- 1. User activity logs (tracks all user actions)
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'login', 'logout', 'deck_created', 'deck_updated', 'deck_deleted', 
    'deck_shared', 'deck_viewed', 'deck_exported', 'profile_updated',
    'collaboration_started', 'collaboration_ended'
  )),
  action_details JSONB DEFAULT '{}',
  deck_id UUID REFERENCES public.decks(uuid) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_created 
ON public.user_activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action_created 
ON public.user_activity_logs(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_deck_id 
ON public.user_activity_logs(deck_id) WHERE deck_id IS NOT NULL;

-- 2. Deck analytics (aggregate metrics for each deck)
CREATE TABLE IF NOT EXISTS public.deck_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deck_id UUID REFERENCES public.decks(uuid) ON DELETE CASCADE,
  view_count INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  edit_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  export_count INTEGER DEFAULT 0,
  collaboration_count INTEGER DEFAULT 0,
  total_collaboration_minutes INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMP WITH TIME ZONE,
  last_edited_at TIMESTAMP WITH TIME ZONE,
  component_stats JSONB DEFAULT '{}', -- e.g., {"text": 45, "image": 23, "chart": 12}
  slide_stats JSONB DEFAULT '{}', -- e.g., {"total": 25, "avg_components": 5.2}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT deck_analytics_deck_id_key UNIQUE(deck_id)
);

CREATE INDEX IF NOT EXISTS idx_deck_analytics_deck_id ON public.deck_analytics(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_analytics_view_count ON public.deck_analytics(view_count DESC);

-- 3. Admin audit logs (tracks all admin actions)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_deck_id UUID REFERENCES public.decks(uuid) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'view_user', 'update_user', 'delete_user', 'suspend_user', 'unsuspend_user',
    'view_deck', 'delete_deck', 'export_deck', 'view_analytics', 'export_data',
    'change_user_role', 'reset_password', 'clear_sessions'
  )),
  action_details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created 
ON public.admin_audit_logs(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user 
ON public.admin_audit_logs(target_user_id) WHERE target_user_id IS NOT NULL;

-- 4. User sessions (track login sessions)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_info JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  is_active BOOLEAN DEFAULT true,
  CONSTRAINT user_sessions_session_token_key UNIQUE(session_token)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active 
ON public.user_sessions(user_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at 
ON public.user_sessions(started_at DESC);

-- 5. Platform metrics (for caching aggregated metrics)
CREATE TABLE IF NOT EXISTS public.platform_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_date DATE NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'daily_active_users', 'weekly_active_users', 'monthly_active_users',
    'new_users', 'decks_created', 'slides_created', 'storage_used',
    'collaborations_started', 'api_calls', 'error_count'
  )),
  metric_value NUMERIC NOT NULL,
  metric_details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT platform_metrics_date_type_key UNIQUE(metric_date, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_platform_metrics_date_type 
ON public.platform_metrics(metric_date DESC, metric_type);

-- 6. Create triggers for updated_at fields
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to tables that need updated_at
CREATE TRIGGER handle_deck_analytics_updated_at 
  BEFORE UPDATE ON public.deck_analytics 
  FOR EACH ROW 
  EXECUTE FUNCTION handle_updated_at();

-- 7. Create views for common queries

-- Active users summary view
CREATE OR REPLACE VIEW public.active_users_summary AS
SELECT 
  COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN user_id END) as active_24h,
  COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN user_id END) as active_7d,
  COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN user_id END) as active_30d
FROM public.user_activity_logs
WHERE action_type IN ('login', 'deck_created', 'deck_updated');

-- User metrics view (materialized for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.user_metrics AS
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.role,
  u.created_at as signup_date,
  COUNT(DISTINCT d.uuid) as total_decks,
  COUNT(DISTINCT CASE WHEN d.visibility = 'public' THEN d.uuid END) as public_decks,
  COUNT(DISTINCT CASE WHEN d.visibility = 'private' THEN d.uuid END) as private_decks,
  COALESCE(SUM(jsonb_array_length(d.slides)), 0) as total_slides,
  COUNT(DISTINCT ual.created_at::date) as active_days,
  MAX(ual.created_at) as last_active,
  COALESCE(SUM((d.size->>'totalBytes')::BIGINT), 0) as storage_used
FROM public.users u
LEFT JOIN public.decks d ON d.user_id = u.id
LEFT JOIN public.user_activity_logs ual ON ual.user_id = u.id
GROUP BY u.id, u.email, u.full_name, u.role, u.created_at;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_metrics_id ON public.user_metrics(id);

-- 8. Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

-- Users can only see their own activity logs
CREATE POLICY user_activity_logs_own_data ON public.user_activity_logs
  FOR ALL USING (auth.uid() = user_id);

-- Admins can see all activity logs
CREATE POLICY user_activity_logs_admin_access ON public.user_activity_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Users can see analytics for their own decks
CREATE POLICY deck_analytics_own_decks ON public.deck_analytics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decks 
      WHERE uuid = deck_analytics.deck_id 
      AND user_id = auth.uid()
    )
  );

-- Admins can see all deck analytics
CREATE POLICY deck_analytics_admin_access ON public.deck_analytics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Only admins can access audit logs
CREATE POLICY admin_audit_logs_admin_only ON public.admin_audit_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Users can see their own sessions
CREATE POLICY user_sessions_own_data ON public.user_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Admins can see all sessions
CREATE POLICY user_sessions_admin_access ON public.user_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Only admins can access platform metrics
CREATE POLICY platform_metrics_admin_only ON public.platform_metrics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- 9. Functions for common operations

-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id UUID,
  p_action_type TEXT,
  p_action_details JSONB DEFAULT '{}',
  p_deck_id UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO public.user_activity_logs (
    user_id, action_type, action_details, deck_id, ip_address, user_agent
  ) VALUES (
    p_user_id, p_action_type, p_action_details, p_deck_id, p_ip_address, p_user_agent
  ) RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment deck analytics
CREATE OR REPLACE FUNCTION increment_deck_analytics(
  p_deck_id UUID,
  p_metric TEXT,
  p_increment INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.deck_analytics (deck_id)
  VALUES (p_deck_id)
  ON CONFLICT (deck_id) DO NOTHING;
  
  CASE p_metric
    WHEN 'view' THEN
      UPDATE public.deck_analytics 
      SET view_count = view_count + p_increment,
          last_viewed_at = NOW()
      WHERE deck_id = p_deck_id;
    WHEN 'edit' THEN
      UPDATE public.deck_analytics 
      SET edit_count = edit_count + p_increment,
          last_edited_at = NOW()
      WHERE deck_id = p_deck_id;
    WHEN 'share' THEN
      UPDATE public.deck_analytics 
      SET share_count = share_count + p_increment
      WHERE deck_id = p_deck_id;
    WHEN 'export' THEN
      UPDATE public.deck_analytics 
      SET export_count = export_count + p_increment
      WHERE deck_id = p_deck_id;
    WHEN 'collaboration' THEN
      UPDATE public.deck_analytics 
      SET collaboration_count = collaboration_count + p_increment
      WHERE deck_id = p_deck_id;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Refresh materialized view function
CREATE OR REPLACE FUNCTION refresh_user_metrics()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT ON public.active_users_summary TO authenticated;
GRANT SELECT ON public.user_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION log_user_activity TO authenticated;
GRANT EXECUTE ON FUNCTION increment_deck_analytics TO authenticated;

-- Admin-only permissions
GRANT ALL ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.platform_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_user_metrics TO authenticated;

-- Schedule periodic refresh of materialized view (run this in Supabase dashboard)
-- SELECT cron.schedule('refresh-user-metrics', '*/10 * * * *', 'SELECT refresh_user_metrics();');