-- Migration 024: Add thumbnail columns to decks table for server-rendered slide thumbnails
-- Thumbnails are rendered via Playwright on Modal and stored as PNGs in Supabase Storage.
--
-- MANUAL STEP: Create the "thumbnails" storage bucket in Supabase Dashboard → Storage
-- with public access enabled. (The backend auto-creates it on first use, but creating
-- it in the dashboard avoids the first-render delay.)

ALTER TABLE decks ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS thumbnail_rendered_at TIMESTAMPTZ;

-- Update the decks_optimized view to include thumbnail_url
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'decks_optimized') THEN
        DROP VIEW IF EXISTS public.decks_optimized;
    END IF;
END $$;

CREATE OR REPLACE VIEW public.decks_optimized AS
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
    slide_count,
    first_slide,
    thumbnail_url
FROM public.decks;

-- Also add thumbnail_url to community_decks for pre-rendered thumbnails
ALTER TABLE community_decks ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Backfill community_decks thumbnail_url from source decks where available
UPDATE community_decks cd
SET thumbnail_url = d.thumbnail_url
FROM decks d
WHERE cd.deck_uuid = d.uuid
  AND d.thumbnail_url IS NOT NULL
  AND cd.thumbnail_url IS NULL;
