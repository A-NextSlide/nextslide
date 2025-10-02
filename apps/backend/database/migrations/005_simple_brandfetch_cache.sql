-- Migration: Simple Brandfetch Cache Table
-- Purpose: Cache Brandfetch API responses to avoid duplicate expensive calls
-- Simple table - check here first, if not found, call API and store result

-- Drop any existing complex tables
DROP TABLE IF EXISTS public.brand_data CASCADE;
DROP TABLE IF EXISTS public.brandfetch_api_log CASCADE;

-- Create simple brandfetch cache table
CREATE TABLE IF NOT EXISTS public.brandfetch_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- What we're looking up
    identifier TEXT NOT NULL,              -- Original input (nike.com, Nike, etc.)
    normalized_identifier TEXT NOT NULL,   -- Cleaned version (nike.com)
    
    -- API response
    api_response JSONB NOT NULL,          -- Full Brandfetch API response
    success BOOLEAN NOT NULL DEFAULT false, -- Did the API call succeed?
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Usage tracking
    hit_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE UNIQUE INDEX idx_brandfetch_cache_normalized 
ON public.brandfetch_cache(normalized_identifier);

CREATE INDEX idx_brandfetch_cache_success 
ON public.brandfetch_cache(success, created_at);

-- Function to increment hit count when we use cached data
CREATE OR REPLACE FUNCTION increment_cache_hit(cache_identifier TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.brandfetch_cache 
    SET 
        hit_count = hit_count + 1,
        last_accessed_at = NOW()
    WHERE normalized_identifier = cache_identifier;
END;
$$ LANGUAGE plpgsql;

-- Simple stats view
CREATE OR REPLACE VIEW brandfetch_cache_stats AS
SELECT 
    COUNT(*) as total_entries,
    COUNT(*) FILTER (WHERE success = true) as successful_entries,
    COUNT(*) FILTER (WHERE success = false) as failed_entries,
    SUM(hit_count) as total_cache_hits,
    AVG(hit_count) as avg_hits_per_entry,
    MIN(created_at) as oldest_entry,
    MAX(created_at) as newest_entry
FROM public.brandfetch_cache;

-- Test the table
SELECT 'Simple Brandfetch Cache created successfully!' as status;