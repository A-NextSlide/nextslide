-- Brandfetch Cache Management Scripts
-- Collection of useful queries and maintenance scripts for the Brandfetch cache

-- ========================================
-- QUERY SCRIPTS - For monitoring and debugging
-- ========================================

-- View cache statistics
SELECT * FROM brandfetch_cache_stats;

-- View most popular cached brands
SELECT 
    identifier,
    brand_name,
    hit_count,
    created_at,
    last_accessed_at,
    EXTRACT(DAYS FROM NOW() - last_accessed_at) as days_since_last_access
FROM public.brandfetch_cache 
WHERE success = true
ORDER BY hit_count DESC 
LIMIT 20;

-- View recent cache additions
SELECT 
    identifier,
    brand_name,
    success,
    api_status_code,
    created_at,
    hit_count
FROM public.brandfetch_cache 
ORDER BY created_at DESC 
LIMIT 20;

-- View failed cache entries (for debugging API issues)
SELECT 
    identifier,
    api_status_code,
    api_response->>'error' as error_type,
    api_response->>'message' as error_message,
    created_at,
    hit_count
FROM public.brandfetch_cache 
WHERE success = false
ORDER BY created_at DESC;

-- View expired entries
SELECT 
    identifier,
    brand_name,
    expires_at,
    EXTRACT(DAYS FROM NOW() - expires_at) as days_expired,
    hit_count
FROM public.brandfetch_cache 
WHERE expires_at IS NOT NULL AND expires_at < NOW()
ORDER BY expires_at DESC;

-- Find duplicate identifiers (potential normalization issues)
SELECT 
    normalized_identifier,
    COUNT(*) as count,
    array_agg(identifier) as original_identifiers,
    array_agg(id) as cache_ids
FROM public.brandfetch_cache 
GROUP BY normalized_identifier 
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- ========================================
-- MAINTENANCE SCRIPTS
-- ========================================

-- Clean up expired cache entries (returns number of deleted rows)
SELECT cleanup_expired_brandfetch_cache() as deleted_count;

-- Clean up very old unsuccessful entries (older than 7 days)
DELETE FROM public.brandfetch_cache 
WHERE success = false 
AND created_at < NOW() - INTERVAL '7 days';

-- Clean up entries that haven't been accessed in 90 days
DELETE FROM public.brandfetch_cache 
WHERE last_accessed_at < NOW() - INTERVAL '90 days';

-- Update expires_at for entries without expiration (set to 30 days from creation)
UPDATE public.brandfetch_cache 
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL AND success = true;

-- ========================================
-- CACHE HIT RATE ANALYSIS
-- ========================================

-- Analyze cache hit patterns by domain
SELECT 
    CASE 
        WHEN domain IS NOT NULL THEN domain 
        ELSE 'unknown_domain'
    END as domain,
    COUNT(*) as total_entries,
    AVG(hit_count) as avg_hits_per_entry,
    SUM(hit_count) as total_hits,
    MAX(hit_count) as max_hits,
    COUNT(*) FILTER (WHERE hit_count = 0) as unused_entries
FROM public.brandfetch_cache 
WHERE success = true
GROUP BY domain
ORDER BY total_hits DESC;

-- Analyze cache performance by month
SELECT 
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as entries_created,
    COUNT(*) FILTER (WHERE success = true) as successful_entries,
    AVG(hit_count) as avg_hits_per_entry,
    SUM(hit_count) as total_hits_in_month
FROM public.brandfetch_cache 
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- ========================================
-- SEARCH AND LOOKUP QUERIES
-- ========================================

-- Find cache entry by identifier (exact match)
-- Replace 'nike.com' with your search term
SELECT 
    id,
    identifier,
    normalized_identifier,
    brand_name,
    success,
    hit_count,
    created_at,
    expires_at
FROM public.brandfetch_cache 
WHERE normalized_identifier = 'nike.com'
ORDER BY created_at DESC;

-- Search cache entries by brand name (fuzzy match)
-- Replace 'nike' with your search term
SELECT 
    id,
    identifier,
    brand_name,
    success,
    hit_count,
    created_at
FROM public.brandfetch_cache 
WHERE brand_name ILIKE '%nike%'
ORDER BY hit_count DESC;

-- Get full API response for a specific entry
-- Replace the UUID with actual cache entry ID
SELECT 
    identifier,
    brand_name,
    api_response
FROM public.brandfetch_cache 
WHERE id = 'your-uuid-here';

-- ========================================
-- DATA INTEGRITY CHECKS
-- ========================================

-- Check for entries with invalid JSON
SELECT 
    id,
    identifier,
    'api_response' as field_name
FROM public.brandfetch_cache 
WHERE NOT (api_response::text)::json IS NOT NULL;

-- Check for entries with missing required fields
SELECT 
    id,
    identifier,
    CASE 
        WHEN identifier IS NULL OR identifier = '' THEN 'missing_identifier'
        WHEN normalized_identifier IS NULL OR normalized_identifier = '' THEN 'missing_normalized_identifier'
        WHEN api_response IS NULL THEN 'missing_api_response'
        ELSE 'unknown_issue'
    END as issue
FROM public.brandfetch_cache 
WHERE identifier IS NULL OR identifier = '' 
   OR normalized_identifier IS NULL OR normalized_identifier = ''
   OR api_response IS NULL;

-- ========================================
-- BULK OPERATIONS (USE WITH CAUTION)
-- ========================================

-- Reset hit counts for all entries (useful for testing)
-- UPDATE public.brandfetch_cache SET hit_count = 0, last_accessed_at = created_at;

-- Mark all entries as expired (forces fresh API calls)
-- UPDATE public.brandfetch_cache SET expires_at = NOW() - INTERVAL '1 day';

-- Delete all cache entries for a specific domain
-- DELETE FROM public.brandfetch_cache WHERE domain = 'example.com';

-- Clear all unsuccessful cache entries
-- DELETE FROM public.brandfetch_cache WHERE success = false;

-- ========================================
-- EXPORT DATA (for analysis or backup)
-- ========================================

-- Export successful cache entries to JSON format
-- (Run this query and save results to analyze cache data externally)
SELECT 
    json_build_object(
        'identifier', identifier,
        'brand_name', brand_name,
        'domain', domain,
        'logo_urls', logo_urls,
        'colors', colors,
        'fonts', fonts,
        'confidence_score', confidence_score,
        'hit_count', hit_count,
        'created_at', created_at
    ) as cache_entry
FROM public.brandfetch_cache 
WHERE success = true
ORDER BY created_at DESC;