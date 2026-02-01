-- Migration 028: Add social_follow notification type
-- Extends the CHECK constraint on notifications.type to include 'social_follow'

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('view', 'remix', 'badge', 'referral', 'system', 'social_follow'));
