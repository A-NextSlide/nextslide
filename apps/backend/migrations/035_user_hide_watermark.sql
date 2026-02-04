-- Migration 035: Add hide_watermark preference to users table
-- Paid users can toggle this to remove the NextSlide watermark from OG images

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hide_watermark BOOLEAN DEFAULT false;
