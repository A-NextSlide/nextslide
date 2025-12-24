-- API Keys Table Migration
-- Run this in Supabase SQL Editor

-- Create the api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,           -- "ns_live_abc1" (visible in UI)
  key_hash TEXT NOT NULL,             -- SHA256 of full key (for lookup)
  name TEXT DEFAULT 'Default',        -- User's label

  -- Custom context/instructions
  context_instructions TEXT,          -- Custom prompt/instructions
  context_images JSONB DEFAULT '[]',  -- Array of image URLs from storage

  -- Settings
  webhook_url TEXT,                   -- Callback URL when deck completes
  include_edit_link BOOLEAN DEFAULT false,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  request_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(user_id, is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own API keys
CREATE POLICY "Users can view own api keys" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own API keys
CREATE POLICY "Users can create own api keys" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own API keys
CREATE POLICY "Users can update own api keys" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own API keys
CREATE POLICY "Users can delete own api keys" ON api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass for backend operations
CREATE POLICY "Service role full access" ON api_keys
  FOR ALL USING (auth.role() = 'service_role');

-- Create storage bucket for API context images
INSERT INTO storage.buckets (id, name, public)
VALUES ('api-context-images', 'api-context-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Users can upload to their own folder
CREATE POLICY "Users can upload api context images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'api-context-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policy: Users can view their own images
CREATE POLICY "Users can view own api context images" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'api-context-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policy: Users can delete their own images
CREATE POLICY "Users can delete own api context images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'api-context-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
