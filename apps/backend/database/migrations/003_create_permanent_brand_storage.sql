-- Migration: Create Permanent Brand Data Storage
-- Purpose: Simpler table optimized for permanent brand data storage
-- This replaces the cache-oriented structure with a permanent storage design

-- Create permanent brand data table
CREATE TABLE IF NOT EXISTS public.brand_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Brand identifiers (for lookups)
    domain TEXT NOT NULL UNIQUE,           -- Primary lookup key (nike.com, apple.com)
    brand_name TEXT NOT NULL,              -- Brand display name
    aliases JSONB DEFAULT '[]'::jsonb,     -- Alternative identifiers/domains
    
    -- Core brand data
    logos JSONB NOT NULL DEFAULT '{}'::jsonb,     -- Logo URLs by theme/format
    colors JSONB NOT NULL DEFAULT '{}'::jsonb,    -- Color palette and categories
    fonts JSONB NOT NULL DEFAULT '{}'::jsonb,     -- Typography information
    
    -- Additional brand info
    company_info JSONB DEFAULT '{}'::jsonb,       -- Company details, industry, etc.
    social_links JSONB DEFAULT '{}'::jsonb,       -- Social media links
    
    -- Data quality and metadata
    confidence_score INTEGER DEFAULT 0,           -- Data quality score (0-100)
    data_sources JSONB DEFAULT '[]'::jsonb,       -- Where data came from (brandfetch, manual, etc.)
    verified BOOLEAN DEFAULT false,               -- Has this been manually verified?
    
    -- Full API responses (for reference and reprocessing)
    brandfetch_response JSONB,                    -- Original Brandfetch API response
    last_brandfetch_update TIMESTAMP WITH TIME ZONE, -- When Brandfetch was last called
    
    -- Record keeping
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Usage tracking
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE UNIQUE INDEX idx_brand_data_domain ON public.brand_data(domain);
CREATE INDEX idx_brand_data_brand_name ON public.brand_data(brand_name);
CREATE INDEX idx_brand_data_verified ON public.brand_data(verified);
CREATE INDEX idx_brand_data_confidence ON public.brand_data(confidence_score DESC);
CREATE INDEX idx_brand_data_last_accessed ON public.brand_data(last_accessed_at);

-- GIN index for fast JSON searches
CREATE INDEX idx_brand_data_aliases ON public.brand_data USING GIN(aliases);
CREATE INDEX idx_brand_data_colors ON public.brand_data USING GIN(colors);

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_brand_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic updated_at
CREATE TRIGGER trigger_brand_data_updated_at
    BEFORE UPDATE ON public.brand_data
    FOR EACH ROW
    EXECUTE FUNCTION update_brand_data_updated_at();

-- Function to increment access count
CREATE OR REPLACE FUNCTION increment_brand_access(brand_domain TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.brand_data 
    SET 
        access_count = access_count + 1,
        last_accessed_at = NOW()
    WHERE domain = brand_domain;
END;
$$ LANGUAGE plpgsql;

-- Function for upsert operations (insert or update)
CREATE OR REPLACE FUNCTION upsert_brand_data(
    p_domain TEXT,
    p_brand_name TEXT,
    p_logos JSONB DEFAULT '{}'::jsonb,
    p_colors JSONB DEFAULT '{}'::jsonb,
    p_fonts JSONB DEFAULT '{}'::jsonb,
    p_company_info JSONB DEFAULT '{}'::jsonb,
    p_social_links JSONB DEFAULT '{}'::jsonb,
    p_confidence_score INTEGER DEFAULT 0,
    p_brandfetch_response JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    brand_id UUID;
BEGIN
    INSERT INTO public.brand_data (
        domain, brand_name, logos, colors, fonts, company_info, 
        social_links, confidence_score, brandfetch_response, last_brandfetch_update
    ) VALUES (
        p_domain, p_brand_name, p_logos, p_colors, p_fonts, p_company_info,
        p_social_links, p_confidence_score, p_brandfetch_response, NOW()
    )
    ON CONFLICT (domain) DO UPDATE SET
        brand_name = EXCLUDED.brand_name,
        logos = EXCLUDED.logos,
        colors = EXCLUDED.colors,
        fonts = EXCLUDED.fonts,
        company_info = EXCLUDED.company_info,
        social_links = EXCLUDED.social_links,
        confidence_score = EXCLUDED.confidence_score,
        brandfetch_response = EXCLUDED.brandfetch_response,
        last_brandfetch_update = NOW(),
        updated_at = NOW()
    RETURNING id INTO brand_id;
    
    RETURN brand_id;
END;
$$ LANGUAGE plpgsql;

-- View for brand statistics
CREATE OR REPLACE VIEW brand_data_stats AS
SELECT 
    COUNT(*) as total_brands,
    COUNT(*) FILTER (WHERE verified = true) as verified_brands,
    COUNT(*) FILTER (WHERE brandfetch_response IS NOT NULL) as brandfetch_sourced,
    AVG(confidence_score) as avg_confidence_score,
    AVG(access_count) as avg_access_count,
    MAX(access_count) as max_access_count,
    SUM(access_count) as total_accesses,
    COUNT(*) FILTER (WHERE last_accessed_at > NOW() - INTERVAL '30 days') as active_last_30_days,
    MIN(created_at) as oldest_brand,
    MAX(created_at) as newest_brand
FROM public.brand_data;

-- Add helpful comments
COMMENT ON TABLE public.brand_data IS 'Permanent storage for brand data (logos, colors, fonts) from various sources';
COMMENT ON COLUMN public.brand_data.domain IS 'Primary domain identifier (nike.com) - unique key for lookups';
COMMENT ON COLUMN public.brand_data.aliases IS 'Array of alternative identifiers/domains for this brand';
COMMENT ON COLUMN public.brand_data.data_sources IS 'Array of data sources: brandfetch, manual, website_scraping, etc.';
COMMENT ON COLUMN public.brand_data.verified IS 'Has this brand data been manually verified for accuracy?';

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_data TO your_app_role;
-- GRANT EXECUTE ON FUNCTION increment_brand_access TO your_app_role;
-- GRANT EXECUTE ON FUNCTION upsert_brand_data TO your_app_role;
-- GRANT SELECT ON brand_data_stats TO your_app_role;