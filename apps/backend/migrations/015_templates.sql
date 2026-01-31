-- Templates table for Template Gallery with Programmatic SEO
-- Each template is a pre-built presentation that users can preview and use as a starting point.

CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    deck_data JSONB NOT NULL,
    thumbnail_url TEXT,
    use_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_slug ON public.templates(slug);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_active ON public.templates(is_active) WHERE is_active = true;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Anyone can view active templates (public gallery)
CREATE POLICY "Anyone can view active templates" ON public.templates
    FOR SELECT USING (is_active = true);

-- Service role can manage all templates (admin seeding / CRUD)
CREATE POLICY "Service role manage templates" ON public.templates
    FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT ON public.templates TO anon;
GRANT SELECT ON public.templates TO authenticated;
