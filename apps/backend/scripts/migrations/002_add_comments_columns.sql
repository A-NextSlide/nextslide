-- Migration: Add missing columns to comments table
-- Date: 2025-11-01
-- Purpose: Fix missing anchor and mention_user_ids columns

-- Add anchor column for storing comment location/context
ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor jsonb NULL;

-- Add mention_user_ids column for @mentions
ALTER TABLE comments ADD COLUMN IF NOT EXISTS mention_user_ids uuid[] NULL;

-- Add index for better query performance on mentions
CREATE INDEX IF NOT EXISTS idx_comments_mentions ON comments USING GIN (mention_user_ids);

-- Add index for anchor queries
CREATE INDEX IF NOT EXISTS idx_comments_anchor ON comments USING GIN (anchor);

-- Add comment for documentation
COMMENT ON COLUMN comments.anchor IS 'JSONB storing comment anchor info: {type: "component"|"region"|"component_group", slideId, componentId?, componentIds?, rect?}';
COMMENT ON COLUMN comments.mention_user_ids IS 'Array of user IDs that were mentioned in this comment';


