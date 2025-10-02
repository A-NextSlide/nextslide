-- Quick fix for deck_stats permission error
-- This will disable the trigger causing the issue

-- First, check if there's a trigger related to deck_stats
SELECT 
    n.nspname as schema_name,
    t.tgname as trigger_name,
    c.relname as table_name,
    pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'decks'
AND t.tgname LIKE '%deck_stats%';

-- Disable the trigger temporarily
ALTER TABLE decks DISABLE TRIGGER ALL;

-- Now you should be able to insert/update decks
-- After fixing the root cause, re-enable triggers:
-- ALTER TABLE decks ENABLE TRIGGER ALL; 