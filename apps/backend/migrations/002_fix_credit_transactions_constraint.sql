-- Migration: Fix credit_transactions check constraint to allow overage_accumulated
-- Run this directly in Supabase SQL Editor

-- ============================================
-- Update the transaction_type check constraint
-- ============================================

-- First drop the existing constraint
ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

-- Add the updated constraint with all needed types
ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_transaction_type_check
CHECK (transaction_type IN (
    'monthly_allocation',      -- Monthly plan credits
    'purchase',               -- Purchased credits
    'slide_generation',       -- Used for slide gen
    'slide_regeneration',     -- Used for slide regeneration
    'ai_chat',                -- Used for chat
    'ai_edit',                -- Used for AI editing
    'theme_generation',       -- Used for theme gen
    'outline_generation',     -- Used for outline gen
    'image_generation',       -- Used for image gen
    'refund',                 -- Refunded credits
    'adjustment',             -- Manual adjustment
    'overage_accumulated',    -- Pro user overage tracking
    'bonus'                   -- Bonus credits (welcome, referral, etc.)
));

-- Verify the constraint was updated
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'credit_transactions_transaction_type_check';
