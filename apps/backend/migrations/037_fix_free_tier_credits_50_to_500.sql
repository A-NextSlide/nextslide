-- Fix the trigger to give new users 500 credits instead of 50
CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Create credit balance with 500 monthly credits (free tier, no bonus)
  INSERT INTO public.credit_balances (user_id, monthly_credits, purchased_credits, used_credits, period_start, period_end)
  VALUES (NEW.id, 500, 0, 0, NOW(), NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  -- Create free subscription
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (NEW.id, 'free', 'active', NOW(), NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Update existing users who still have the old 50-credit limit
UPDATE credit_balances
SET monthly_credits = 500
WHERE monthly_credits = 50;
