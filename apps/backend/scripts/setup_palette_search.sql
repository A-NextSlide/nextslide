-- Setup script for palette vector similarity search
-- Run this in your Supabase SQL editor

-- First, ensure the pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create function for palette similarity search using pgvector
CREATE OR REPLACE FUNCTION match_palettes(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
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
    WHERE p.embedding IS NOT NULL
        AND 1 - (p.embedding <=> query_embedding) > match_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Alternative function using text representation if vector type isn't working
CREATE OR REPLACE FUNCTION search_palettes_by_embedding(
    query_embedding text,
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
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
DECLARE
    query_vec vector(1536);
BEGIN
    -- Convert text to vector
    query_vec := query_embedding::vector(1536);
    
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.colors,
        p.description,
        p.tags,
        p.category,
        p.context,
        1 - (p.embedding <=> query_vec) as similarity
    FROM palettes p
    WHERE p.embedding IS NOT NULL
        AND 1 - (p.embedding <=> query_vec) > match_threshold
    ORDER BY p.embedding <=> query_vec
    LIMIT match_count;
END;
$$;

-- Create index for faster similarity search if not exists
CREATE INDEX IF NOT EXISTS palettes_embedding_idx ON palettes 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION match_palettes(vector(1536), float, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_palettes_by_embedding(text, float, int) TO anon, authenticated;

-- Test the function (optional)
-- SELECT * FROM match_palettes('[0.1, 0.2, ...]'::vector(1536), 0.5, 5);