-- Migration: Create Brandfetch API Call Log
-- Purpose: Simple table to record all Brandfetch API calls by URL to avoid duplicates
-- This is NOT permanent storage, just a record of what we've called

-- Create brandfetch API log table
CREATE TABLE IF NOT EXISTS public.brandfetch_api_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Request info
    url TEXT NOT NULL,                        -- The URL/domain we called (nike.com, apple.com)
    normalized_url TEXT NOT NULL,             -- Cleaned version for consistent lookups
    
    -- Response data
    api_response JSONB NOT NULL,              -- Full Brandfetch API response
    success BOOLEAN NOT NULL DEFAULT false,   -- Whether the call succeeded
    
    -- Timestamps
    called_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Simple hit tracking
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast lookups by URL
CREATE UNIQUE INDEX idx_brandfetch_log_normalized_url 
ON public.brandfetch_api_log(normalized_url);

-- Create index for successful calls
CREATE INDEX idx_brandfetch_log_success 
ON public.brandfetch_api_log(success, called_at);

-- Function to increment access count when we use cached data
CREATE OR REPLACE FUNCTION increment_api_log_access(log_url TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.brandfetch_api_log 
    SET 
        access_count = access_count + 1,
        last_accessed = NOW()
    WHERE normalized_url = log_url;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert API call records
CREATE OR REPLACE FUNCTION record_brandfetch_call(
    p_url TEXT,
    p_normalized_url TEXT,
    p_api_response JSONB,
    p_success BOOLEAN
) RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO public.brandfetch_api_log (
        url, normalized_url, api_response, success
    ) VALUES (
        p_url, p_normalized_url, p_api_response, p_success
    )
    ON CONFLICT (normalized_url) DO UPDATE SET
        api_response = EXCLUDED.api_response,
        success = EXCLUDED.success,
        called_at = NOW()
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Simple stats view
CREATE OR REPLACE VIEW brandfetch_api_stats AS
SELECT 
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE success = true) as successful_calls,
    COUNT(*) FILTER (WHERE success = false) as failed_calls,
    SUM(access_count) as total_reuses,
    AVG(access_count) as avg_reuses_per_call,
    MIN(called_at) as first_call,
    MAX(called_at) as latest_call
FROM public.brandfetch_api_log;

-- Add comments
COMMENT ON TABLE public.brandfetch_api_log IS 'Log of Brandfetch API calls to avoid duplicate requests';
COMMENT ON COLUMN public.brandfetch_api_log.url IS 'Original URL/domain passed to API';
COMMENT ON COLUMN public.brandfetch_api_log.normalized_url IS 'Cleaned URL for consistent lookups';
COMMENT ON COLUMN public.brandfetch_api_log.api_response IS 'Full JSON response from Brandfetch API';
COMMENT ON COLUMN public.brandfetch_api_log.access_count IS 'How many times this cached response was reused';