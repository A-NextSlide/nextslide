-- Migration 025: Slack integration tables
-- Supports: workspace installation, user account linking, and generation session tracking.

-- ============================================================================
-- slack_workspaces: One row per installed Slack workspace
-- ============================================================================
CREATE TABLE IF NOT EXISTS slack_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT UNIQUE NOT NULL,
    team_name TEXT NOT NULL DEFAULT '',
    bot_token TEXT NOT NULL,              -- Fernet-encrypted xoxb-... token
    bot_user_id TEXT NOT NULL DEFAULT '',
    installer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scopes TEXT[] DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_workspaces_team_id ON slack_workspaces(team_id);

-- ============================================================================
-- slack_user_mappings: Links Slack users to NextSlide accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS slack_user_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slack_user_id TEXT NOT NULL,
    slack_team_id TEXT NOT NULL,
    nextslide_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slack_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(slack_user_id, slack_team_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_user_mappings_nextslide_user
    ON slack_user_mappings(nextslide_user_id);

-- ============================================================================
-- slack_generation_sessions: Tracks in-flight slash-command conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS slack_generation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slack_team_id TEXT NOT NULL,
    slack_channel_id TEXT NOT NULL,
    slack_thread_ts TEXT,
    slack_user_id TEXT NOT NULL,
    slack_response_url TEXT,
    nextslide_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    deck_id UUID,
    state TEXT NOT NULL DEFAULT 'gathering_context'
        CHECK (state IN ('gathering_context', 'clarifying', 'generating', 'completed', 'failed')),
    clarification_data JSONB DEFAULT '{}',
    context_data JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_sessions_team_channel
    ON slack_generation_sessions(slack_team_id, slack_channel_id);
CREATE INDEX IF NOT EXISTS idx_slack_sessions_state
    ON slack_generation_sessions(state) WHERE state NOT IN ('completed', 'failed');

-- ============================================================================
-- RLS policies
-- ============================================================================

ALTER TABLE slack_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_user_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_generation_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend uses service key)
CREATE POLICY slack_workspaces_service ON slack_workspaces
    FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY slack_user_mappings_service ON slack_user_mappings
    FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY slack_generation_sessions_service ON slack_generation_sessions
    FOR ALL USING (TRUE) WITH CHECK (TRUE);
