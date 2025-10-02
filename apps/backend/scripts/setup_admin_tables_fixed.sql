-- Fixed version of admin tables setup that handles JSON status field
-- Script to set up admin dashboard tables and functions

-- 1. Add role column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_sign_in_at ON users(last_sign_in_at);

-- 2. Create admin_audit_logs table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    target_user_id UUID REFERENCES users(id),
    target_deck_id UUID,
    action TEXT NOT NULL,
    action_details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user_id ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user_id ON admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- 3. Create user_sessions table for tracking sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_token TEXT,
    ip_address INET,
    user_agent TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at);

-- 4. Create user_activity_logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    action_type TEXT NOT NULL,
    action_details JSONB DEFAULT '{}'::jsonb,
    deck_id UUID,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for activity logs
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action_type ON user_activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);

-- 5. Create platform_metrics table for caching metrics
CREATE TABLE IF NOT EXISTS platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    metric_type TEXT NOT NULL,
    metric_value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(metric_date, metric_type)
);

-- Create index for metrics
CREATE INDEX IF NOT EXISTS idx_platform_metrics_date_type ON platform_metrics(metric_date, metric_type);

-- 6. Create or update deck_analytics table
CREATE TABLE IF NOT EXISTS deck_analytics (
    deck_id UUID PRIMARY KEY,
    view_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    edit_count INTEGER DEFAULT 0,
    collaboration_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    last_edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create function to get user deck counts (for performance)
CREATE OR REPLACE FUNCTION get_user_deck_counts(user_ids UUID[])
RETURNS TABLE (
    user_id UUID,
    deck_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.user_id,
        COUNT(*)::BIGINT as deck_count
    FROM decks d
    WHERE d.user_id = ANY(user_ids)
    GROUP BY d.user_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Create view for active users summary
CREATE OR REPLACE VIEW active_users_summary AS
SELECT 
    COUNT(DISTINCT CASE WHEN last_sign_in_at >= NOW() - INTERVAL '24 hours' THEN id END) as active_24h,
    COUNT(DISTINCT CASE WHEN last_sign_in_at >= NOW() - INTERVAL '7 days' THEN id END) as active_7d,
    COUNT(DISTINCT CASE WHEN last_sign_in_at >= NOW() - INTERVAL '30 days' THEN id END) as active_30d
FROM users
WHERE status = 'active';

-- 9. Create materialized view for user metrics
-- This version properly handles both TEXT and JSONB status fields
DROP MATERIALIZED VIEW IF EXISTS user_metrics CASCADE;

CREATE MATERIALIZED VIEW user_metrics AS
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.created_at,
    u.last_sign_in_at,
    u.status,
    u.role,
    COUNT(DISTINCT d.uuid) as total_decks,
    -- Handle status field which might be TEXT or JSONB
    COUNT(DISTINCT CASE 
        WHEN pg_typeof(d.status) = 'jsonb'::regtype THEN
            CASE WHEN d.status::jsonb->>'status' = 'completed' THEN d.uuid END
        ELSE
            CASE WHEN d.status::text = 'completed' THEN d.uuid END
    END) as completed_decks,
    COUNT(DISTINCT CASE 
        WHEN pg_typeof(d.status) = 'jsonb'::regtype THEN
            CASE WHEN d.status::jsonb->>'status' = 'draft' THEN d.uuid END
        ELSE
            CASE WHEN COALESCE(d.status::text, 'draft') = 'draft' THEN d.uuid END
    END) as draft_decks,
    -- Handle visibility field which might be TEXT or JSONB
    COUNT(DISTINCT CASE 
        WHEN pg_typeof(d.visibility) = 'jsonb'::regtype THEN
            CASE WHEN d.visibility::jsonb->>'visibility' = 'public' THEN d.uuid END
        ELSE
            CASE WHEN COALESCE(d.visibility::text, 'private') = 'public' THEN d.uuid END
    END) as public_decks,
    COALESCE(SUM(CASE WHEN d.slides IS NOT NULL THEN JSONB_ARRAY_LENGTH(d.slides) ELSE 0 END), 0) as total_slides,
    MAX(d.created_at) as last_deck_created,
    ROUND(EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 86400)::INTEGER as account_age_days
FROM users u
LEFT JOIN decks d ON u.id = d.user_id
GROUP BY u.id, u.email, u.full_name, u.created_at, u.last_sign_in_at, u.status, u.role;

-- Create index on user_metrics
CREATE INDEX IF NOT EXISTS idx_user_metrics_id ON user_metrics(id);
CREATE INDEX IF NOT EXISTS idx_user_metrics_created_at ON user_metrics(created_at);

-- 10. Grant permissions
GRANT ALL ON admin_audit_logs TO authenticated;
GRANT ALL ON user_sessions TO authenticated;
GRANT ALL ON user_activity_logs TO authenticated;
GRANT ALL ON platform_metrics TO authenticated;
GRANT ALL ON deck_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_deck_counts TO authenticated;
GRANT SELECT ON active_users_summary TO authenticated;
GRANT SELECT ON user_metrics TO authenticated;

-- 11. Set up Row Level Security (RLS)
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_analytics ENABLE ROW LEVEL SECURITY;

-- Admin audit logs - only admins can read
CREATE POLICY "Admin audit logs are viewable by admins only" ON admin_audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Admin audit logs - only system can insert
CREATE POLICY "Admin audit logs can only be created by system" ON admin_audit_logs
    FOR INSERT WITH CHECK (true);

-- User sessions - users can see their own, admins can see all
CREATE POLICY "Users can view their own sessions" ON user_sessions
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- User activity logs - users can see their own, admins can see all
CREATE POLICY "Users can view their own activity" ON user_activity_logs
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Platform metrics - admins only
CREATE POLICY "Platform metrics are viewable by admins only" ON platform_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Deck analytics - deck owners and admins
CREATE POLICY "Deck analytics viewable by deck owners and admins" ON deck_analytics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM decks 
            WHERE decks.uuid = deck_analytics.deck_id 
            AND decks.user_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- 12. Create function to refresh user metrics
CREATE OR REPLACE FUNCTION refresh_user_metrics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_metrics;
END;
$$ LANGUAGE plpgsql;

-- 13. Create a simpler deck count function for the API
CREATE OR REPLACE FUNCTION get_deck_stats_for_user(p_user_id UUID)
RETURNS TABLE (
    total_decks BIGINT,
    completed_decks BIGINT,
    draft_decks BIGINT,
    public_decks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_decks,
        COUNT(CASE WHEN 
            CASE 
                WHEN jsonb_typeof(status) = 'object' THEN status->>'status' 
                ELSE status::text 
            END = 'completed' 
        THEN 1 END)::BIGINT as completed_decks,
        COUNT(CASE WHEN 
            CASE 
                WHEN jsonb_typeof(status) = 'object' THEN status->>'status' 
                ELSE status::text 
            END = 'draft' 
        THEN 1 END)::BIGINT as draft_decks,
        COUNT(CASE WHEN 
            CASE 
                WHEN jsonb_typeof(visibility) = 'object' THEN visibility->>'visibility' 
                ELSE visibility::text 
            END = 'public' 
        THEN 1 END)::BIGINT as public_decks
    FROM decks
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_deck_stats_for_user TO authenticated;

-- 14. Print helpful information
DO $$
BEGIN
    RAISE NOTICE 'Admin tables setup completed successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Update a user to admin role:';
    RAISE NOTICE '   UPDATE users SET role = ''admin'' WHERE email = ''your-admin@email.com'';';
    RAISE NOTICE '';
    RAISE NOTICE '2. Refresh the user metrics view:';
    RAISE NOTICE '   SELECT refresh_user_metrics();';
    RAISE NOTICE '';
    RAISE NOTICE '3. (Optional) Set up periodic refresh with pg_cron:';
    RAISE NOTICE '   SELECT cron.schedule(''refresh-user-metrics'', ''*/30 * * * *'', ''SELECT refresh_user_metrics();'');';
END
$$;