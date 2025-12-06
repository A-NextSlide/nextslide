-- ============================================================================
-- BILLING & SUBSCRIPTION SYSTEM TABLES
-- ============================================================================

-- Pricing Plans
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,  -- Price in cents (e.g., 999 = $9.99)
  stripe_price_id TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO public.pricing_plans (id, name, description, monthly_credits, price_cents, features) VALUES
  ('free', 'Free', 'Try NextSlide with limited credits', 10, 0, '["2 free slides", "Basic AI features", "Export to PDF"]'::jsonb),
  ('starter', 'Starter', 'Perfect for individuals', 200, 999, '["~30-40 presentations/month", "All AI features", "Export to PDF & PPTX", "Email support"]'::jsonb),
  ('pro', 'Pro', 'For professionals and teams', 500, 1999, '["~75-100 presentations/month", "Priority AI generation", "All export formats", "Priority support", "Custom branding"]'::jsonb),
  ('enterprise', 'Enterprise', 'Custom solutions for large teams', -1, 0, '["Unlimited credits", "Dedicated support", "Custom integrations", "SSO & SAML", "SLA"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- User Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.pricing_plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'paused')),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)  -- One active subscription per user
);

-- Credit Balances (monthly allocation + purchased)
CREATE TABLE IF NOT EXISTS public.credit_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  monthly_credits INTEGER DEFAULT 0,      -- From plan
  purchased_credits INTEGER DEFAULT 0,    -- Extra purchased
  used_credits INTEGER DEFAULT 0,         -- Used this period
  period_start TIMESTAMPTZ DEFAULT NOW(),
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)  -- One balance record per user
);

-- Credit Transactions (detailed log of all credit changes)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,  -- Positive = credit added, Negative = credit consumed
  balance_after INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'monthly_allocation',  -- Monthly plan credits
    'purchase',           -- Purchased credits
    'slide_generation',   -- Used for slide gen
    'ai_chat',            -- Used for chat
    'ai_edit',            -- Used for AI editing
    'theme_generation',   -- Used for theme gen
    'refund',             -- Refunded credits
    'adjustment'          -- Manual adjustment
  )),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,  -- deck_id, slide_id, tokens_used, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit Costs Configuration (what actions cost how many credits)
CREATE TABLE IF NOT EXISTS public.credit_costs (
  action_type TEXT PRIMARY KEY,
  credit_cost INTEGER NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default credit costs
INSERT INTO public.credit_costs (action_type, credit_cost, description) VALUES
  ('slide_generation', 5, 'Generate a new slide'),
  ('slide_regeneration', 3, 'Regenerate an existing slide'),
  ('ai_chat', 1, 'AI chat message'),
  ('ai_edit', 2, 'AI-assisted component edit'),
  ('theme_generation', 3, 'Generate a theme'),
  ('outline_generation', 2, 'Generate presentation outline'),
  ('image_generation', 3, 'Generate an AI image')
ON CONFLICT (action_type) DO NOTHING;

-- Stripe Payment Methods
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL,
  card_brand TEXT,
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices (synced from Stripe)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,
  invoice_url TEXT,
  pdf_url TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_credit_balances_user_id ON public.credit_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON public.payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);

-- Function to get remaining credits for a user
CREATE OR REPLACE FUNCTION public.get_remaining_credits(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_balance RECORD;
BEGIN
  SELECT * INTO v_balance FROM public.credit_balances WHERE user_id = p_user_id;

  IF v_balance IS NULL THEN
    RETURN 0;
  END IF;

  RETURN GREATEST(0, (v_balance.monthly_credits + v_balance.purchased_credits) - v_balance.used_credits);
END;
$$ LANGUAGE plpgsql;

-- Function to consume credits
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
DECLARE
  v_remaining INTEGER;
  v_balance RECORD;
BEGIN
  -- Get current balance
  SELECT * INTO v_balance FROM public.credit_balances WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN FALSE;
  END IF;

  v_remaining := (v_balance.monthly_credits + v_balance.purchased_credits) - v_balance.used_credits;

  IF v_remaining < p_amount THEN
    RETURN FALSE;
  END IF;

  -- Update balance
  UPDATE public.credit_balances
  SET used_credits = used_credits + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description, metadata)
  VALUES (p_user_id, -p_amount, v_remaining - p_amount, p_transaction_type, p_description, p_metadata);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to initialize free tier credits for new users
CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Create credit balance with free tier credits
  INSERT INTO public.credit_balances (user_id, monthly_credits, purchased_credits, used_credits, period_start, period_end)
  VALUES (NEW.id, 200, 0, 0, NOW(), NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  -- Create free subscription
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (NEW.id, 'free', 'active', NOW(), NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-initialize credits for new users
DROP TRIGGER IF EXISTS on_user_created_init_credits ON public.users;
CREATE TRIGGER on_user_created_init_credits
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_user_credits();

-- RLS Policies
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own balance" ON public.credit_balances
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own payment methods" ON public.payment_methods
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own invoices" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

-- Pricing plans are public
CREATE POLICY "Anyone can view plans" ON public.pricing_plans
  FOR SELECT USING (true);

-- Service role can do everything (for webhooks)
CREATE POLICY "Service can manage subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service can manage balances" ON public.credit_balances
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service can manage transactions" ON public.credit_transactions
  FOR ALL USING (auth.role() = 'service_role');
