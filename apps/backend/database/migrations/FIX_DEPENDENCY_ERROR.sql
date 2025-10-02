-- FIX: Handle dependency errors in migration
-- Run this to fix the "cannot drop function" error

-- Step 1: Drop triggers first (they depend on functions)
DROP TRIGGER IF EXISTS trigger_brandfetch_cache_updated_at ON public.brandfetch_cache;

-- Step 2: Drop functions with CASCADE to handle any remaining dependencies
DROP FUNCTION IF EXISTS public.cleanup_expired_brandfetch_cache() CASCADE;
DROP FUNCTION IF EXISTS public.increment_brandfetch_cache_hit(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_brandfetch_cache_updated_at() CASCADE;

-- Step 3: Drop the view
DROP VIEW IF EXISTS public.brandfetch_cache_stats;

-- Step 4: Drop the table completely (this will clean up everything else)
DROP TABLE IF EXISTS public.brandfetch_cache CASCADE;

-- Verify everything is cleaned up
SELECT 
    'brandfetch_cache objects remaining:' as check_type,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_name = 'brandfetch_cache' AND table_schema = 'public'
UNION ALL
SELECT 
    'brandfetch functions remaining:' as check_type,
    COUNT(*) as count
FROM information_schema.routines 
WHERE routine_name LIKE '%brandfetch%' AND routine_schema = 'public';