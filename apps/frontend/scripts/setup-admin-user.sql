-- Script to set up admin access for specific users
-- Run this in your Supabase SQL editor

-- 1. First, make sure the user exists in the users table
-- Replace 'your-email@example.com' with the actual admin email
DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'ahmed@nextslide.ai'; -- Change this to your email
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User with email % not found in auth.users', v_email;
  ELSE
    -- Insert or update the user in public.users table
    INSERT INTO public.users (id, email, role, created_at, updated_at)
    VALUES (v_user_id, v_email, 'admin', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        updated_at = NOW();
    
    RAISE NOTICE 'User % has been granted admin access', v_email;
  END IF;
END $$;

-- 2. View all current admins
SELECT id, email, full_name, role, created_at
FROM public.users
WHERE role = 'admin'
ORDER BY created_at DESC;

-- 3. Optional: Grant admin access to multiple users at once
-- Uncomment and modify the emails below
/*
UPDATE public.users
SET role = 'admin', updated_at = NOW()
WHERE email IN (
  'admin@nextslide.ai',
  'ahmed@nextslide.ai'
  -- Add more emails here
)
AND role != 'admin';
*/

-- 4. Create a function to easily grant admin access
CREATE OR REPLACE FUNCTION grant_admin_access(user_email TEXT)
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
  v_result TEXT;
BEGIN
  -- Get user ID from auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF v_user_id IS NULL THEN
    RETURN 'Error: User not found';
  END IF;
  
  -- Update or insert user with admin role
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (v_user_id, user_email, 'admin', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET role = 'admin', updated_at = NOW();
  
  RETURN 'Success: Admin access granted to ' || user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage example:
-- SELECT grant_admin_access('your-email@example.com');