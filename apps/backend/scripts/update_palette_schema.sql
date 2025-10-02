-- Add adjacency matrix column to palettes table if it doesn't exist
ALTER TABLE palettes 
ADD COLUMN IF NOT EXISTS adjacency_matrix integer[] DEFAULT NULL;

-- Add index for adjacency matrix queries
CREATE INDEX IF NOT EXISTS idx_palettes_adjacency ON palettes USING GIN (adjacency_matrix);

-- Add columns for better Huemint integration
ALTER TABLE palettes
ADD COLUMN IF NOT EXISTS adjacency_template text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS topic text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS score float DEFAULT NULL;

-- Create index for topic searches
CREATE INDEX IF NOT EXISTS idx_palettes_topic ON palettes USING btree (topic);

-- Update the match_palettes function to include new columns
CREATE OR REPLACE FUNCTION match_palettes(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    name text,
    colors text[],
    description text,
    tags text[],
    category text,
    context text,
    adjacency_matrix integer[],
    adjacency_template text,
    topic text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.colors,
        p.description,
        p.tags,
        p.category,
        p.context,
        p.adjacency_matrix,
        p.adjacency_template,
        p.topic,
        1 - (p.embedding <=> query_embedding) as similarity
    FROM palettes p
    WHERE 1 - (p.embedding <=> query_embedding) > match_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;