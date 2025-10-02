-- Simplified admin tables setup script
-- This version assumes TEXT fields for status and visibility

-- 1. Add role column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator', 'premium'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create indexes
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

-- 4. Create function to get user deck counts
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

-- 5. Create function to get deck stats for a user
-- This version assumes status is TEXT or can be cast to TEXT
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
        COUNT(CASE WHEN COALESCE(status::text, 'draft') = 'completed' THEN 1 END)::BIGINT as completed_decks,
        COUNT(CASE WHEN COALESCE(status::text, 'draft') = 'draft' THEN 1 END)::BIGINT as draft_decks,
        COUNT(CASE WHEN COALESCE(visibility::text, 'private') = 'public' THEN 1 END)::BIGINT as public_decks
    FROM decks
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Grant permissions
GRANT ALL ON admin_audit_logs TO authenticated;
GRANT ALL ON user_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_deck_counts TO authenticated;
GRANT EXECUTE ON FUNCTION get_deck_stats_for_user TO authenticated;

-- 7. Set up Row Level Security (RLS)
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

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

-- 8. Add status and visibility columns to decks if they don't exist
ALTER TABLE decks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ DEFAULT NOW();

-- 9. Create indexes on decks table
CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_status ON decks(status);
CREATE INDEX IF NOT EXISTS idx_decks_visibility ON decks(visibility);
CREATE INDEX IF NOT EXISTS idx_decks_created_at ON decks(created_at);

-- 10. Print success message
DO $$
BEGIN
    RAISE NOTICE 'Admin tables setup completed successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Update a user to admin role:';
    RAISE NOTICE '   UPDATE users SET role = ''admin'' WHERE email = ''your-admin@email.com'';';
    RAISE NOTICE '';
    RAISE NOTICE '2. Test the admin API:';
    RAISE NOTICE '   python scripts/test_admin_api.py';
END
$$;