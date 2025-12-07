-- Migration: Create featured_decks table for landing page showcase
-- These are curated decks that are publicly accessible without authentication

-- Create the featured_decks table
CREATE TABLE IF NOT EXISTS public.featured_decks (
    id SERIAL PRIMARY KEY,
    uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    slides JSONB NOT NULL DEFAULT '[]'::jsonb,
    slide_count INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for ordering
CREATE INDEX idx_featured_decks_order ON public.featured_decks(display_order, is_active);

-- Enable RLS but allow public read access
ALTER TABLE public.featured_decks ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read featured decks (no auth required)
CREATE POLICY "Anyone can view featured decks"
    ON public.featured_decks
    FOR SELECT
    USING (is_active = true);

-- Only service role can modify
CREATE POLICY "Service role can manage featured decks"
    ON public.featured_decks
    FOR ALL
    USING (auth.role() = 'service_role');

-- Grant read access to anon and authenticated users
GRANT SELECT ON public.featured_decks TO anon;
GRANT SELECT ON public.featured_decks TO authenticated;

-- Now copy the featured decks from the main decks table
INSERT INTO public.featured_decks (uuid, name, description, slides, slide_count, display_order, is_active)
SELECT
    d.uuid,
    d.name,
    d.description,
    d.slides,
    COALESCE(jsonb_array_length(d.slides), 0) as slide_count,
    CASE d.uuid
        WHEN '88a6a5c6-035e-4ab0-9415-7e735bcc7aec' THEN 1
        WHEN '2cb6a421-5751-465d-bc48-a9e943a127f6' THEN 2
        WHEN '3990e7b6-7bf4-48a9-bd6c-e0de06bddb62' THEN 3
        WHEN '78e58c26-8133-407e-ac21-dab87edce4c6' THEN 4
        WHEN 'e52311b1-f957-4873-b9ec-1cf285e05a87' THEN 5
    END as display_order,
    true as is_active
FROM public.decks d
WHERE d.uuid IN (
    '88a6a5c6-035e-4ab0-9415-7e735bcc7aec',
    '2cb6a421-5751-465d-bc48-a9e943a127f6',
    '3990e7b6-7bf4-48a9-bd6c-e0de06bddb62',
    '78e58c26-8133-407e-ac21-dab87edce4c6',
    'e52311b1-f957-4873-b9ec-1cf285e05a87'
)
ON CONFLICT (uuid) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    slides = EXCLUDED.slides,
    slide_count = EXCLUDED.slide_count,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Verify the data was copied
SELECT uuid, name, slide_count, display_order FROM public.featured_decks ORDER BY display_order;
