-- ============================================================================
-- EXTENDED USER ONBOARDING FLAGS MIGRATION
-- Adds additional columns to track comprehensive onboarding state
-- ============================================================================

-- Add new columns to users table for tracking extended onboarding state
-- tutorial_completed: whether user has completed the tutorial/feature walkthrough
-- overage_confirmed: whether user has seen and acknowledged overage billing info (only ask once)
-- feature_hints_dismissed: JSON array of dismissed feature hint IDs

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS overage_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS feature_hints_dismissed TEXT[] DEFAULT '{}';

-- Create index for faster queries on tutorial completion
CREATE INDEX IF NOT EXISTS idx_users_tutorial_completed ON public.users(tutorial_completed);

-- Grant necessary permissions
GRANT SELECT, UPDATE ON public.users TO authenticated;
