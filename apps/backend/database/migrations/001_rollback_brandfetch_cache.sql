-- Rollback Migration: Drop Brandfetch API Cache Table
-- Purpose: Remove all Brandfetch cache related objects
-- Use this to rollback the 001_create_brandfetch_cache.sql migration

-- Drop the view
DROP VIEW IF EXISTS public.brandfetch_cache_stats;

-- Drop functions
DROP FUNCTION IF EXISTS public.cleanup_expired_brandfetch_cache();
DROP FUNCTION IF EXISTS public.increment_brandfetch_cache_hit(UUID);
DROP FUNCTION IF EXISTS public.update_brandfetch_cache_updated_at();

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_brandfetch_cache_updated_at ON public.brandfetch_cache;

-- Drop indexes (they will be automatically dropped with the table, but being explicit)
DROP INDEX IF EXISTS public.idx_brandfetch_cache_normalized_identifier;
DROP INDEX IF EXISTS public.idx_brandfetch_cache_identifier;
DROP INDEX IF EXISTS public.idx_brandfetch_cache_domain;
DROP INDEX IF EXISTS public.idx_brandfetch_cache_expires_at;
DROP INDEX IF EXISTS public.idx_brandfetch_cache_created_at;
DROP INDEX IF EXISTS public.idx_brandfetch_cache_success_normalized;

-- Drop the main table
DROP TABLE IF EXISTS public.brandfetch_cache;

-- Note: If you had granted specific permissions, you might need to revoke them
-- REVOKE ALL ON public.brandfetch_cache FROM your_app_role;