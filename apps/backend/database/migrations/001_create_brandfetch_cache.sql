-- Migration: Create Brandfetch API Cache Table
-- Purpose: Cache expensive Brandfetch API responses to reduce API costs
-- Run this in Supabase SQL Editor

-- Create brandfetch_cache table
CREATE TABLE IF NOT EXISTS public.brandfetch_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Request identifiers
    identifier TEXT NOT NULL,              -- The original identifier (domain, brand name, etc.)
    normalized_identifier TEXT NOT NULL,   -- Cleaned/normalized version for consistent lookups
    api_endpoint TEXT NOT NULL,           -- Which Brandfetch endpoint was called
    
    -- API Response Data
    api_response JSONB NOT NULL,          -- Full Brandfetch API response
    api_status_code INTEGER NOT NULL,     -- HTTP status code from Brandfetch
    
    -- Processed/Extracted Data (for faster queries)
    brand_name TEXT,                      -- Extracted brand name
    domain TEXT,                          -- Extracted domain
    logo_urls JSONB,                      -- Array of logo URLs by theme/format
    colors JSONB,                         -- Color data (hex values, categories)
    fonts JSONB,                          -- Font information
    company_info JSONB,                   -- Company details
    
    -- Cache metadata
    success BOOLEAN NOT NULL DEFAULT false, -- Whether the API call was successful
    confidence_score INTEGER DEFAULT 0,     -- Quality/confidence of the data
    quality_score BOOLEAN DEFAULT false,    -- Brandfetch's claimed/verified status
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,  -- When this cache entry expires (NULL = permanent)
    
    -- Usage tracking
    hit_count INTEGER DEFAULT 0,          -- How many times this cache entry was used
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_brandfetch_cache_normalized_identifier 
ON public.brandfetch_cache(normalized_identifier);

CREATE INDEX IF NOT EXISTS idx_brandfetch_cache_identifier 
ON public.brandfetch_cache(identifier);

CREATE INDEX IF NOT EXISTS idx_brandfetch_cache_domain 
ON public.brandfetch_cache(domain) 
WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brandfetch_cache_expires_at 
ON public.brandfetch_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_brandfetch_cache_created_at 
ON public.brandfetch_cache(created_at);

-- Create partial index for successful entries only (most common queries)
CREATE INDEX IF NOT EXISTS idx_brandfetch_cache_success_normalized 
ON public.brandfetch_cache(normalized_identifier, created_at) 
WHERE success = true;

-- Add RLS (Row Level Security) if needed
-- ALTER TABLE public.brandfetch_cache ENABLE ROW LEVEL SECURITY;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_brandfetch_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at
CREATE TRIGGER trigger_brandfetch_cache_updated_at
    BEFORE UPDATE ON public.brandfetch_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_brandfetch_cache_updated_at();

-- Create function to increment hit count and update last_accessed_at
CREATE OR REPLACE FUNCTION increment_brandfetch_cache_hit(cache_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.brandfetch_cache 
    SET 
        hit_count = hit_count + 1,
        last_accessed_at = NOW()
    WHERE id = cache_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_brandfetch_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.brandfetch_cache 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create view for cache statistics
CREATE OR REPLACE VIEW brandfetch_cache_stats AS
SELECT 
    COUNT(*) as total_entries,
    COUNT(*) FILTER (WHERE success = true) as successful_entries,
    COUNT(*) FILTER (WHERE success = false) as failed_entries,
    COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW()) as active_entries,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired_entries,
    AVG(hit_count) as avg_hit_count,
    MAX(hit_count) as max_hit_count,
    SUM(hit_count) as total_hits,
    MIN(created_at) as oldest_entry,
    MAX(created_at) as newest_entry
FROM public.brandfetch_cache;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.brandfetch_cache TO your_app_role;
-- GRANT EXECUTE ON FUNCTION increment_brandfetch_cache_hit TO your_app_role;
-- GRANT EXECUTE ON FUNCTION cleanup_expired_brandfetch_cache TO your_app_role;
-- GRANT SELECT ON brandfetch_cache_stats TO your_app_role;

-- Add some comments for documentation
COMMENT ON TABLE public.brandfetch_cache IS 'Cache table for Brandfetch API responses to reduce API costs and improve performance';
COMMENT ON COLUMN public.brandfetch_cache.identifier IS 'Original identifier passed to Brandfetch API (domain, brand name, etc.)';
COMMENT ON COLUMN public.brandfetch_cache.normalized_identifier IS 'Cleaned and normalized identifier for consistent cache lookups';
COMMENT ON COLUMN public.brandfetch_cache.api_response IS 'Full JSON response from Brandfetch API';
COMMENT ON COLUMN public.brandfetch_cache.expires_at IS 'When this cache entry expires (NULL = never expires)';
COMMENT ON COLUMN public.brandfetch_cache.hit_count IS 'Number of times this cache entry has been accessed';