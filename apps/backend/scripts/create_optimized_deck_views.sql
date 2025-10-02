-- Create optimized views for deck queries that only fetch the first slide
-- This avoids loading the entire slides array when listing decks

-- Drop existing views if they exist
DROP VIEW IF EXISTS decks_optimized CASCADE;

-- Create optimized view for deck listings
CREATE OR REPLACE VIEW decks_optimized AS
SELECT 
    uuid,
    name,
    created_at,
    updated_at,
    last_modified,
    user_id,
    status,
    description,
    visibility,
    data,
    -- Only get the first slide for thumbnails (slides is JSONB)
    CASE 
        WHEN slides IS NOT NULL AND jsonb_array_length(slides) > 0 
        THEN jsonb_build_array(slides->0)
        ELSE '[]'::jsonb
    END as slides,
    -- Get the total slide count
    COALESCE(jsonb_array_length(slides), 0) as slide_count
FROM decks;

-- Grant appropriate permissions
GRANT SELECT ON decks_optimized TO authenticated;
GRANT SELECT ON decks_optimized TO anon;

-- Create an index on user_id for better performance
CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id);
-- Composite index to accelerate filtering by user and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_decks_user_id_created_at ON decks(user_id, created_at DESC);

-- Add RLS policies to the view (inherits from base table)
ALTER VIEW decks_optimized SET (security_invoker = true);

COMMENT ON VIEW decks_optimized IS 'Optimized view for deck listings that only includes the first slide';
