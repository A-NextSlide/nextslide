-- Additional SQL functions needed for admin dashboard

-- Function to get total slides for a user
CREATE OR REPLACE FUNCTION get_user_total_slides(p_user_id UUID)
RETURNS TABLE (
    total_slides BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(JSONB_ARRAY_LENGTH(slides)), 0)::BIGINT as total_slides
    FROM decks
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_total_slides TO authenticated;

-- Function to calculate storage used (simplified - counts JSON size)
CREATE OR REPLACE FUNCTION get_user_storage_used(p_user_id UUID)
RETURNS BIGINT AS $$
BEGIN
    RETURN (
        SELECT COALESCE(SUM(LENGTH(slides::text) + LENGTH(COALESCE(data::text, '{}'))), 0)::BIGINT
        FROM decks
        WHERE user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_storage_used TO authenticated;

-- View for deck analytics (simplified)
CREATE OR REPLACE VIEW deck_analytics_summary AS
SELECT 
    d.uuid as deck_id,
    d.user_id,
    COALESCE(da.view_count, 0) as view_count,
    COALESCE(da.edit_count, 0) as edit_count,
    COALESCE(da.share_count, 0) as share_count
FROM decks d
LEFT JOIN deck_analytics da ON d.uuid = da.deck_id;

-- Grant select permission
GRANT SELECT ON deck_analytics_summary TO authenticated;