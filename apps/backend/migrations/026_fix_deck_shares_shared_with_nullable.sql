-- Migration 026: Make shared_with nullable for link-based shares
--
-- The deck_shares table serves two purposes:
--   1. Link-based sharing (short_code, share_type) - no specific recipient
--   2. User-to-user sharing (shared_by, shared_with) - specific recipient
--
-- shared_with should be NULL for link-based shares. The NOT NULL constraint
-- (if present) prevents creating multiple share links for the same deck.

ALTER TABLE deck_shares ALTER COLUMN shared_with DROP NOT NULL;
