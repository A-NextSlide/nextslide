-- Migration 023: Ensure decks.notes JSONB column exists for narrative flow storage
-- The narrative flow analyzer saves structured story-arc, themes, tips etc. into this column.

ALTER TABLE decks ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT NULL;

-- Index for efficient NULL checks (polling queries: "is narrative ready?")
CREATE INDEX IF NOT EXISTS idx_decks_notes_not_null ON decks (uuid) WHERE notes IS NOT NULL;
