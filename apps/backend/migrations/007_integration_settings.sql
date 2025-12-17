-- Integration Settings
-- Stores system-wide integration configuration and enabled status
-- Works alongside integration_registry.py for dynamic integration management

CREATE TABLE IF NOT EXISTS public.integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id TEXT NOT NULL UNIQUE,  -- e.g., 'linkedin', 'salesforce'
  enabled BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',            -- Integration-specific configuration
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_integration_settings_id
  ON public.integration_settings(integration_id);

CREATE INDEX IF NOT EXISTS idx_integration_settings_enabled
  ON public.integration_settings(enabled);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_integration_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS integration_settings_updated_at ON public.integration_settings;
CREATE TRIGGER integration_settings_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_integration_settings_updated_at();

-- Insert default settings for LinkedIn (enabled by default)
INSERT INTO public.integration_settings (integration_id, enabled, config)
VALUES ('linkedin', true, '{"provider": "apollo"}')
ON CONFLICT (integration_id) DO NOTHING;

-- Note: No RLS on this table - it's system-wide configuration
-- Access is controlled at the API level (admin endpoints)
