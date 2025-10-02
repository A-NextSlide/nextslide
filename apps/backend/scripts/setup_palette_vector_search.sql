-- Create function for palette similarity search using pgvector
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
        1 - (p.embedding <=> query_embedding) as similarity
    FROM palettes p
    WHERE 1 - (p.embedding <=> query_embedding) > match_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Create index for faster similarity search if not exists
CREATE INDEX IF NOT EXISTS palettes_embedding_idx ON palettes 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);