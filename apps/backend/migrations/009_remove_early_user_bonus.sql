-- Migration: Remove early user bonus from credit initialization
-- This fixes the issue where new free users were getting 50 monthly + 450 bonus credits
-- Free users should only get 50 monthly credits with no bonus

-- Update the trigger function to remove the early user bonus
CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Create credit balance with 50 monthly credits (free tier, no bonus)
  INSERT INTO public.credit_balances (user_id, monthly_credits, purchased_credits, used_credits, period_start, period_end)
  VALUES (NEW.id, 50, 0, 0, NOW(), NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  -- Create free subscription
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (NEW.id, 'free', 'active', NOW(), NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This migration only affects NEW users created after it's applied.
-- Existing users who received bonus credits will keep them.
-- To reset existing free users to 50 credits, run the following manually:
--
-- UPDATE public.credit_balances cb
-- SET purchased_credits = 0
-- FROM public.subscriptions s
-- WHERE cb.user_id = s.user_id
--   AND s.plan_id = 'free'
--   AND cb.purchased_credits > 0;
