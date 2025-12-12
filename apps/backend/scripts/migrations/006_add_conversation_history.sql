-- ============================================================================
-- ADD CONVERSATION HISTORY TO DECKS
-- Stores the full chat conversation (user + AI) per deck
-- ============================================================================

-- Add conversation_history JSONB column to decks table
-- Structure: {
--   "initial_request": "user's original topic/prompt",
--   "messages": [
--     {"role": "user", "content": "...", "timestamp": "..."},
--     {"role": "assistant", "content": "...", "timestamp": "..."},
--     ...
--   ]
-- }

ALTER TABLE public.decks
ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '{"initial_request": null, "messages": []}'::jsonb;

-- Create GIN index for efficient querying of conversation content
CREATE INDEX IF NOT EXISTS idx_decks_conversation_history ON public.decks USING GIN (conversation_history);

-- Grant necessary permissions
GRANT SELECT, UPDATE ON public.decks TO authenticated;
