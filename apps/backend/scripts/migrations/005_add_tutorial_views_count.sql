-- ============================================================================
-- ADD TUTORIAL VIEWS COUNT MIGRATION
-- Adds column to track how many times the tutorial has been shown (limit: 2 times per user)
-- ============================================================================

-- Add tutorial_views_count column to users table
-- This replaces the boolean tutorial_completed with a counter
-- Tutorial will be shown until user has seen it 2 times

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS tutorial_views_count INTEGER DEFAULT 0;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_tutorial_views_count ON public.users(tutorial_views_count);

-- Grant necessary permissions
GRANT SELECT, UPDATE ON public.users TO authenticated;
