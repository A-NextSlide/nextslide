-- ============================================================================
-- USER ONBOARDING FLAGS MIGRATION
-- Adds columns to track user onboarding state
-- ============================================================================

-- Add columns to users table for tracking onboarding state
-- welcome_shown: whether the welcome modal has been displayed
-- presentations_created: count of presentations created (for showing AI hints)

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS welcome_shown BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS presentations_created INTEGER DEFAULT 0;

-- Create an index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_presentations_created ON public.users(presentations_created);

-- Create a function to increment presentations_created when a deck is created
CREATE OR REPLACE FUNCTION increment_user_presentations()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET presentations_created = COALESCE(presentations_created, 0) + 1
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on decks table
DROP TRIGGER IF EXISTS on_deck_created_increment_presentations ON public.decks;
CREATE TRIGGER on_deck_created_increment_presentations
  AFTER INSERT ON public.decks
  FOR EACH ROW
  EXECUTE FUNCTION increment_user_presentations();

-- Backfill existing users with their current deck count
UPDATE public.users u
SET presentations_created = (
  SELECT COUNT(*)
  FROM public.decks d
  WHERE d.user_id = u.id
)
WHERE presentations_created IS NULL OR presentations_created = 0;

-- Grant necessary permissions
GRANT SELECT, UPDATE ON public.users TO authenticated;
