-- Add missing columns to decks table
-- Run this in your Supabase SQL editor

-- Add theme column if it doesn't exist
ALTER TABLE decks 
ADD COLUMN IF NOT EXISTS theme JSONB DEFAULT '{}';

-- Add data column if it doesn't exist
ALTER TABLE decks 
ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';

-- Add outline column if it doesn't exist
ALTER TABLE decks 
ADD COLUMN IF NOT EXISTS outline JSONB;

-- Add version column if it doesn't exist
ALTER TABLE decks 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add last_modified column if it doesn't exist
ALTER TABLE decks 
ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ DEFAULT NOW();

-- Add created_at column if it doesn't exist
ALTER TABLE decks 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Verify the schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'decks' 
ORDER BY ordinal_position;