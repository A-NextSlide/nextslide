-- Fix the get_deck_stats_for_user function to handle TEXT columns properly

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_deck_stats_for_user(UUID);

-- Create a safer version that handles TEXT columns
CREATE OR REPLACE FUNCTION get_deck_stats_for_user(p_user_id UUID)
RETURNS TABLE (
    total_decks BIGINT,
    completed_decks BIGINT,
    draft_decks BIGINT,
    public_decks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_decks,
        -- Handle status as TEXT (not JSONB)
        COUNT(CASE WHEN COALESCE(status::text, 'draft') = 'completed' THEN 1 END)::BIGINT as completed_decks,
        COUNT(CASE WHEN COALESCE(status::text, 'draft') = 'draft' THEN 1 END)::BIGINT as draft_decks,
        -- Handle visibility as TEXT (not JSONB)
        COUNT(CASE WHEN COALESCE(visibility::text, 'private') = 'public' THEN 1 END)::BIGINT as public_decks
    FROM decks
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_deck_stats_for_user TO authenticated;

-- Also check if metadata column is TEXT or JSONB
DO $$
DECLARE
    metadata_type TEXT;
BEGIN
    -- Check the actual data type of metadata column
    SELECT data_type INTO metadata_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'users'
      AND column_name = 'metadata';
    
    RAISE NOTICE 'Metadata column type: %', metadata_type;
    
    -- If metadata is TEXT and we need it to be JSONB, we can convert it
    IF metadata_type = 'text' THEN
        RAISE NOTICE 'Metadata is TEXT. Consider converting to JSONB if needed.';
        -- Uncomment below to convert:
        -- ALTER TABLE users ALTER COLUMN metadata TYPE JSONB USING metadata::jsonb;
    END IF;
END
$$;

-- Quick test to see column types
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'decks')
  AND column_name IN ('status', 'visibility', 'metadata')
ORDER BY table_name, column_name;