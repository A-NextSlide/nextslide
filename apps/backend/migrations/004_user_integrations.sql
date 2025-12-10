-- User Integrations (Nango connections cache)
-- Stores user connection metadata for quick lookups
-- Actual OAuth tokens are stored securely in Nango

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Nango connection identifiers
  provider TEXT NOT NULL,           -- e.g., 'linkedin', 'salesforce', 'google-drive'
  connection_id TEXT NOT NULL,      -- Nango connection ID

  -- Display info (cached from Nango)
  provider_account_email TEXT,      -- Email associated with the connected account
  provider_account_name TEXT,       -- Display name from the provider

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_used_at TIMESTAMPTZ,
  error_message TEXT,

  -- Metadata
  scopes TEXT[],                    -- Granted scopes
  metadata JSONB DEFAULT '{}',      -- Additional provider-specific metadata

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_integrations_unique
  ON public.user_integrations(user_id, provider);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user
  ON public.user_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_integrations_provider
  ON public.user_integrations(provider);

CREATE INDEX IF NOT EXISTS idx_user_integrations_connection
  ON public.user_integrations(connection_id);

-- Enable RLS
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own integrations
DO $$ BEGIN
  CREATE POLICY user_integrations_owner ON public.user_integrations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_user_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_integrations_updated_at ON public.user_integrations;
CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_user_integrations_updated_at();

-- Integration usage logs (optional - for analytics)
CREATE TABLE IF NOT EXISTS public.integration_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.user_integrations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  action TEXT NOT NULL,              -- e.g., 'profile_lookup', 'search_emails', 'read_file'
  success BOOLEAN DEFAULT TRUE,
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_usage_user
  ON public.integration_usage_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_integration_usage_created
  ON public.integration_usage_logs(created_at);

-- Enable RLS
ALTER TABLE public.integration_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY integration_usage_owner ON public.integration_usage_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
