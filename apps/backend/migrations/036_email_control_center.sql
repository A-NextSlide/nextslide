-- ============================================================================
-- 036: Email Control Center
-- Tables: email_templates, email_campaigns, email_sends
-- ============================================================================

-- ============================================================================
-- 1. email_templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'transactional'
        CHECK (category IN ('transactional', 'growth', 'onboarding', 'product_updates')),
    html_body TEXT NOT NULL DEFAULT '',
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_email_templates_slug ON email_templates(slug);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON email_templates(is_active);

-- ============================================================================
-- 2. email_campaigns
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    subject_override TEXT,
    audience TEXT NOT NULL DEFAULT 'all'
        CHECK (audience IN ('all', 'pro', 'free', 'inactive')),
    audience_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled ON email_campaigns(scheduled_at)
    WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_email_campaigns_template ON email_campaigns(template_id);

-- ============================================================================
-- 3. email_sends
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_sends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    recipient_user_id UUID,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed')),
    resend_id TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_template ON email_sends(template_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_recipient ON email_sends(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status);
CREATE INDEX IF NOT EXISTS idx_email_sends_sent_at ON email_sends(sent_at DESC);

-- ============================================================================
-- 4. RLS: service_role full access, no public access (admin-only via backend)
-- ============================================================================
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

-- Service role policies (full access for backend)
CREATE POLICY "service_role_email_templates" ON email_templates
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_email_campaigns" ON email_campaigns
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_email_sends" ON email_sends
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. Seed system templates from existing email_service.py
-- ============================================================================
INSERT INTO email_templates (name, slug, subject, category, html_body, variables, is_system, is_active, version)
VALUES
(
    'Collaborator Invite',
    'collaborator-invite',
    'You''re invited to collaborate on ''{{deck_name}}''',
    'transactional',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
    <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
        </div>
        <div style="padding: 32px 40px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">You''ve been invited to collaborate</h2>
            <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">Someone has invited you to collaborate on a presentation:</p>
            <div style="background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111;">{{deck_name}}</p>
            </div>
            <a href="{{share_url}}" style="display: inline-block; padding: 14px 28px; background: #FF4301; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Open Presentation</a>
            <p style="margin: 24px 0 0; color: #999; font-size: 14px; line-height: 1.5;">Or copy this link: <a href="{{share_url}}" style="color: #FF4301; text-decoration: none;">{{share_url}}</a></p>
        </div>
        <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
            <p style="margin: 0; color: #999; font-size: 12px;">&copy; Nextslide. Create beautiful presentations with AI.</p>
        </div>
    </div>
</body>
</html>',
    '["deck_name", "share_url"]'::jsonb,
    true, true, 1
),
(
    'Password Reset',
    'password-reset',
    'Reset your Nextslide password',
    'transactional',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
    <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
        </div>
        <div style="padding: 32px 40px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">Reset your password</h2>
            <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">We received a request to reset your password. Click the button below to choose a new password.</p>
            <a href="{{reset_link}}" style="display: inline-block; padding: 12px 24px; background: #111; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Reset Password</a>
            <p style="margin: 24px 0 0; color: #999; font-size: 14px; line-height: 1.5;">If you didn''t request this, you can safely ignore this email. This link will expire in 24 hours.</p>
        </div>
        <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
            <p style="margin: 0; color: #999; font-size: 12px;">&copy; Nextslide. All rights reserved.</p>
        </div>
    </div>
</body>
</html>',
    '["reset_link"]'::jsonb,
    true, true, 1
),
(
    'View Milestone',
    'view-milestone',
    'Your slides are getting noticed',
    'growth',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; margin: 0; padding: 0; background-color: #fafafa;">
    <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
        </div>
        <div style="padding: 32px 40px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">People are watching</h2>
            <p style="margin: 0 0 24px; color: #666; line-height: 1.6;">Hey {{user_name}},</p>
            <p style="margin: 0 0 24px; color: #666; line-height: 1.6;">Your presentation <strong>{{deck_title}}</strong> just hit <strong>{{view_count}} views</strong> today.</p>
            <div style="background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111;">{{deck_title}} &mdash; {{view_count}} views and counting</p>
            </div>
            <a href="https://app.nextslide.ai/app" style="display: inline-block; padding: 14px 28px; background: #FF4301; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Create Another</a>
            <p style="margin: 24px 0 0; color: #999; font-size: 14px; line-height: 1.5;">Or share this one: <a href="{{deck_url}}" style="color: #FF4301; text-decoration: none;">{{deck_url}}</a></p>
        </div>
        <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
            <p style="margin: 0; color: #999; font-size: 12px;">&copy; Nextslide. Turn ideas into presentations.</p>
        </div>
    </div>
</body>
</html>',
    '["user_name", "deck_title", "view_count", "deck_url"]'::jsonb,
    true, true, 1
),
(
    'Session Cleared',
    'session-cleared',
    'Security notice: All sessions signed out',
    'transactional',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
    <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
        </div>
        <div style="padding: 32px 40px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">Sessions signed out</h2>
            <p style="margin: 0 0 16px; color: #666; line-height: 1.5;">All active sessions for your account have been signed out for security purposes.</p>
            <p style="margin: 0; color: #666; line-height: 1.5;">If this wasn''t you, please reset your password immediately.</p>
        </div>
    </div>
</body>
</html>',
    '[]'::jsonb,
    true, true, 1
),
(
    'Weekly Digest',
    'weekly-digest',
    'Your Nextslide weekly update',
    'product_updates',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
    <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
        </div>
        <div style="padding: 32px 40px;">
            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">Your weekly update</h2>
            <p style="margin: 0 0 24px; color: #666; line-height: 1.6;">Hey {{user_name}}, here''s what happened this week:</p>
            <div style="background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #666;"><strong>{{total_views}}</strong> total views across your presentations</p>
                <p style="margin: 0 0 8px; font-size: 14px; color: #666;"><strong>{{new_decks}}</strong> new presentations created</p>
                <p style="margin: 0; font-size: 14px; color: #666;"><strong>{{top_deck}}</strong> was your most viewed deck</p>
            </div>
            <a href="https://app.nextslide.ai/app" style="display: inline-block; padding: 14px 28px; background: #FF4301; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Go to Dashboard</a>
        </div>
        <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
            <p style="margin: 0; color: #999; font-size: 12px;">&copy; Nextslide. Create beautiful presentations with AI.</p>
        </div>
    </div>
</body>
</html>',
    '["user_name", "total_views", "new_decks", "top_deck"]'::jsonb,
    true, true, 1
)
ON CONFLICT (slug) DO NOTHING;
