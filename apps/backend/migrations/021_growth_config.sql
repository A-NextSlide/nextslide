-- Migration 021: Growth Config Table
-- Key-value store for all PLG feature configuration
-- Allows admins to tune referral credits, badge rewards, streak milestones,
-- notification thresholds, PQA settings, and feature toggles without code deploys.

CREATE TABLE IF NOT EXISTS growth_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE growth_config ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (admin endpoints use service_role client)
CREATE POLICY "Service role full access on growth_config"
    ON growth_config
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Seed default configuration values
INSERT INTO growth_config (key, value, description) VALUES
    -- Referral program
    ('referral.enabled', 'true', 'Enable/disable the referral program'),
    ('referral.referee_signup_credits', '25', 'Credits awarded to new user on referral signup'),
    ('referral.referrer_activation_credits', '50', 'Credits awarded to referrer when referee creates first deck'),

    -- Gamification
    ('gamification.enabled', 'true', 'Enable/disable gamification features'),
    ('gamification.badge_credits', '{"first_deck":10,"prolific_10":15,"prolific_25":20,"prolific_50":25,"crowd_100":10,"crowd_500":15,"crowd_1000":25,"remix_master":20,"community_star":25,"team_player":15,"sharing_champ":15,"streak_3":10,"streak_7":25,"streak_30":100}', 'Credit rewards per badge type'),
    ('gamification.streak_milestones', '{"3":10,"7":25,"30":100}', 'Streak milestone days -> credit rewards'),

    -- Notifications
    ('notifications.enabled', 'true', 'Enable/disable notification system'),
    ('notifications.view_threshold', '5', 'Daily views on a deck before triggering notification'),
    ('notifications.email_on_views', 'true', 'Send email when view threshold is hit'),
    ('notifications.weekly_digest', 'true', 'Enable weekly digest emails'),

    -- PQA (Enterprise detection)
    ('pqa.enabled', 'true', 'Enable/disable PQA detection'),
    ('pqa.threshold', '3', 'Minimum users on same domain to qualify as PQA'),

    -- Showcase / Community
    ('community.enabled', 'true', 'Enable/disable community showcase'),
    ('community.auto_approve', 'false', 'Auto-approve community submissions'),

    -- SEO & Templates
    ('seo.landing_pages_enabled', 'true', 'Enable/disable SEO landing pages'),
    ('seo.template_gallery_enabled', 'true', 'Enable/disable template gallery'),

    -- Viral features
    ('viral.badge_enabled', 'true', 'Enable "Made with NextSlide" badge on shared decks'),
    ('viral.embed_enabled', 'true', 'Enable embeddable presentations'),
    ('viral.og_previews_enabled', 'true', 'Enable OG image previews for shared links')
ON CONFLICT (key) DO NOTHING;
