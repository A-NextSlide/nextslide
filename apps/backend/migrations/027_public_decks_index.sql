-- Migration: Add index for public decks queries and category columns
-- This enables efficient queries for the public presentations browse page

-- Index for quickly finding public active decks
CREATE INDEX IF NOT EXISTS idx_deck_shares_public_active
ON deck_shares (created_at DESC)
WHERE is_public = true AND is_active = true;

-- Add category and description columns to deck_shares for public deck metadata
-- These are only used when is_public = true
ALTER TABLE deck_shares ADD COLUMN IF NOT EXISTS public_title TEXT;
ALTER TABLE deck_shares ADD COLUMN IF NOT EXISTS public_description TEXT;
ALTER TABLE deck_shares ADD COLUMN IF NOT EXISTS public_category TEXT;

-- Index for category-based browsing
CREATE INDEX IF NOT EXISTS idx_deck_shares_public_category
ON deck_shares (public_category, created_at DESC)
WHERE is_public = true AND is_active = true;
