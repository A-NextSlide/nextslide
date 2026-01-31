-- Migration 011: Referral Program
-- Adds referral codes and referral tracking tables

-- Referral codes table
CREATE TABLE IF NOT EXISTS public.referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_referral UNIQUE (user_id)
);

-- Referral tracking table
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id),
    referee_id UUID NOT NULL REFERENCES auth.users(id),
    referral_code TEXT NOT NULL,
    status TEXT DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'activated', 'rewarded')),
    referrer_credits_awarded INTEGER DEFAULT 0,
    referee_credits_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    rewarded_at TIMESTAMPTZ,
    CONSTRAINT unique_referee UNIQUE (referee_id)
);

-- Indexes
CREATE INDEX idx_referral_codes_user ON public.referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_referee ON public.referrals(referee_id);

-- RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Policies for referral_codes
CREATE POLICY "Users can view own referral code" ON public.referral_codes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own referral code" ON public.referral_codes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access referral_codes" ON public.referral_codes FOR ALL USING (auth.role() = 'service_role');

-- Policies for referrals
CREATE POLICY "Users can view own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Service role full access referrals" ON public.referrals FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT SELECT, INSERT ON public.referral_codes TO authenticated;
GRANT SELECT ON public.referrals TO authenticated;
