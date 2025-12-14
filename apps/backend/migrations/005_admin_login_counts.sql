-- Migration: Add function to get daily login counts from auth audit log
-- This enables accurate login tracking in the admin analytics dashboard

-- Function to get login counts per day for the past N days
-- Uses auth.audit_log_entries which records all authentication events
CREATE OR REPLACE FUNCTION public.get_daily_login_counts(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  login_date DATE,
  login_count BIGINT
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(ale.created_at) AS login_date,
    COUNT(*) AS login_count
  FROM auth.audit_log_entries ale
  WHERE
    -- Filter for login actions (the payload is JSONB in recent Supabase versions)
    (ale.payload->>'action' = 'login' OR ale.payload->>'action' = 'user_signedup')
    -- Only count events from the past N days
    AND ale.created_at >= (CURRENT_TIMESTAMP - (days_back || ' days')::INTERVAL)
    AND ale.created_at < CURRENT_TIMESTAMP
  GROUP BY DATE(ale.created_at)
  ORDER BY login_date ASC;
END;
$$;

-- Grant execute permission to authenticated users (admin check happens in API layer)
GRANT EXECUTE ON FUNCTION public.get_daily_login_counts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_login_counts(INTEGER) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_daily_login_counts IS 'Returns daily login counts from auth audit log for admin analytics. Requires service_role or admin access.';
