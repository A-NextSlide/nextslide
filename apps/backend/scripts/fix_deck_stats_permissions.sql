-- Fix deck_stats materialized view permissions issue
-- This error occurs when the materialized view has incorrect ownership

-- First, check if the materialized view exists
SELECT 
    schemaname,
    matviewname,
    matviewowner
FROM pg_matviews 
WHERE matviewname = 'deck_stats';

-- Option 1: Change ownership to the authenticated role
-- This is the most common fix for Supabase
ALTER MATERIALIZED VIEW deck_stats OWNER TO authenticated;

-- Grant necessary permissions to all roles that need access
GRANT ALL ON deck_stats TO authenticated;
GRANT ALL ON deck_stats TO service_role;
GRANT ALL ON deck_stats TO anon;

-- Option 2: If you need to change ownership to postgres user
-- ALTER MATERIALIZED VIEW deck_stats OWNER TO postgres;

-- Option 3: If the above doesn't work, disable any triggers temporarily
-- Find and disable the trigger causing the issue
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    tgtype
FROM pg_trigger 
WHERE tgname LIKE '%deck_stats%';

-- If there's a refresh trigger, you can disable it temporarily:
-- ALTER TABLE decks DISABLE TRIGGER refresh_deck_stats_trigger;

-- Option 4: If you don't need real-time stats, drop the trigger entirely
-- DROP TRIGGER IF EXISTS refresh_deck_stats_trigger ON decks;

-- Option 5: Recreate the materialized view with proper ownership
-- This is a more drastic measure if the above doesn't work
/*
-- First drop the existing view
DROP MATERIALIZED VIEW IF EXISTS deck_stats CASCADE;

-- Recreate with proper ownership
CREATE MATERIALIZED VIEW deck_stats AS
SELECT 
    user_id,
    COUNT(*) as deck_count,
    MAX(created_at) as last_deck_created,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_decks
FROM decks
GROUP BY user_id;

-- Set proper ownership from the start
ALTER MATERIALIZED VIEW deck_stats OWNER TO postgres;

-- Grant permissions
GRANT ALL ON deck_stats TO authenticated;
GRANT ALL ON deck_stats TO service_role;
GRANT ALL ON deck_stats TO anon;

-- Create index for performance
CREATE INDEX idx_deck_stats_user_id ON deck_stats(user_id);
*/ 