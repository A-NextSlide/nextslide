-- Script to fix missing user names in the admin dashboard

-- First, check how many users have missing names
SELECT 
    COUNT(*) FILTER (WHERE full_name IS NULL OR full_name = '') as missing_names,
    COUNT(*) FILTER (WHERE full_name IS NOT NULL AND full_name != '') as has_names,
    COUNT(*) as total_users
FROM users;

-- Update users without names to use email prefix as name
UPDATE users 
SET full_name = INITCAP(REPLACE(SPLIT_PART(email, '@', 1), '.', ' '))
WHERE full_name IS NULL OR full_name = '';

-- Verify the update
SELECT id, email, full_name, role, status, created_at
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- Make sure the role column exists and has proper values
UPDATE users 
SET role = 'user' 
WHERE role IS NULL;

-- Ensure status column has proper values
UPDATE users 
SET status = 'active' 
WHERE status IS NULL;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_full_name ON users(full_name);

-- Print summary
DO $$
DECLARE
    user_count INTEGER;
    admin_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ User data fixed!';
    RAISE NOTICE '   Total users: %', user_count;
    RAISE NOTICE '   Admin users: %', admin_count;
    RAISE NOTICE '';
    RAISE NOTICE 'All users now have names based on their email addresses.';
    RAISE NOTICE '';
    RAISE NOTICE 'To make a user an admin, run:';
    RAISE NOTICE '   UPDATE users SET role = ''admin'' WHERE email = ''your-email@example.com'';';
END $$;