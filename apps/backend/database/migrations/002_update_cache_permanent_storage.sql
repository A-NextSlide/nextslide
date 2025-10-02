-- Migration: Update Brandfetch Cache for Permanent Storage
-- Purpose: Change default behavior to permanent storage instead of 7-day expiry
-- Run this in Supabase SQL Editor AFTER running 001_create_brandfetch_cache.sql

-- Step 1: Update the default for expires_at column to be NULL (permanent)
ALTER TABLE public.brandfetch_cache 
ALTER COLUMN expires_at SET DEFAULT NULL;

-- Step 2: Update any existing entries that have expiry dates to be permanent
-- (Optional: Remove this if you want to keep existing expiry dates)
UPDATE public.brandfetch_cache 
SET expires_at = NULL
WHERE expires_at IS NOT NULL;

-- Step 3: Add a comment to document the change
COMMENT ON COLUMN public.brandfetch_cache.expires_at IS 'When this cache entry expires (NULL = permanent storage, default behavior)';

-- Step 4: Update the cleanup function to only clean truly expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_brandfetch_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Only delete entries where expires_at is explicitly set AND has passed
    DELETE FROM public.brandfetch_cache 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Verify the changes
SELECT 
    COUNT(*) as total_entries,
    COUNT(*) FILTER (WHERE expires_at IS NULL) as permanent_entries,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) as expiring_entries,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired_entries
FROM public.brandfetch_cache;