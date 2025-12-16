-- Migration: Add slide_count and first_slide columns to decks table
-- This optimizes queries by avoiding fetching the full slides JSONB column

-- Add slide_count column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'decks'
        AND column_name = 'slide_count'
    ) THEN
        ALTER TABLE public.decks ADD COLUMN slide_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add first_slide column for thumbnails (stores only the first slide)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'decks'
        AND column_name = 'first_slide'
    ) THEN
        ALTER TABLE public.decks ADD COLUMN first_slide JSONB;
    END IF;
END $$;

-- Populate slide_count and first_slide for existing decks
UPDATE public.decks
SET
    slide_count = COALESCE(jsonb_array_length(slides), 0),
    first_slide = CASE
        WHEN slides IS NOT NULL AND jsonb_array_length(slides) > 0
        THEN slides->0
        ELSE NULL
    END
WHERE slide_count IS NULL OR slide_count = 0 OR first_slide IS NULL;

-- Create or replace function to update slide_count and first_slide on insert/update
CREATE OR REPLACE FUNCTION update_deck_slide_metadata()
RETURNS TRIGGER AS $$
BEGIN
    NEW.slide_count := COALESCE(jsonb_array_length(NEW.slides), 0);
    NEW.first_slide := CASE
        WHEN NEW.slides IS NOT NULL AND jsonb_array_length(NEW.slides) > 0
        THEN NEW.slides->0
        ELSE NULL
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_deck_slide_count ON public.decks;
DROP TRIGGER IF EXISTS trigger_update_deck_slide_metadata ON public.decks;

-- Create the new trigger
CREATE TRIGGER trigger_update_deck_slide_metadata
    BEFORE INSERT OR UPDATE OF slides ON public.decks
    FOR EACH ROW
    EXECUTE FUNCTION update_deck_slide_metadata();

-- Create index on slide_count for efficient analytics queries
CREATE INDEX IF NOT EXISTS idx_decks_slide_count ON public.decks(slide_count);

-- Update decks_optimized view to include first_slide (if view exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'decks_optimized') THEN
        DROP VIEW IF EXISTS public.decks_optimized;
    END IF;
END $$;

-- Recreate the optimized view with first_slide column
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
    first_slide
FROM public.decks;

-- Create composite index for user_id + created_at (for deck listing queries)
CREATE INDEX IF NOT EXISTS idx_decks_user_created ON public.decks(user_id, created_at DESC);

-- Create index on created_at for date range queries
CREATE INDEX IF NOT EXISTS idx_decks_created_at ON public.decks(created_at DESC);

-- Verify the migration
SELECT
    COUNT(*) as total_decks,
    SUM(slide_count) as total_slides,
    ROUND(AVG(slide_count)::numeric, 2) as avg_slides_per_deck
FROM public.decks;
