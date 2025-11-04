# Comments API Database Schema Fix

## Problem
During slide generation, the comments API was failing with the following error:

```
postgrest.exceptions.APIError: {'message': 'column users_1.raw_user_meta_data does not exist', 'code': '42703'}
```

This error occurred when trying to fetch comments for each slide, causing 500 Internal Server errors.

## Root Cause
The code in `api/requests/api_comments.py` was trying to access the `raw_user_meta_data` column from the `public.users` table. However:

1. The `raw_user_meta_data` column only exists in the `auth.users` table (Supabase's internal auth schema)
2. The `public.users` table has a different schema with columns: `full_name`, `metadata`, etc.
3. The `ensure_users_table.sql` migration copies data from `auth.users.raw_user_meta_data` to `public.users.metadata`

## Solution

### Code Changes
Updated `apps/backend/api/requests/api_comments.py` to use the correct schema:

**Before:**
```python
# Incorrect - trying to access raw_user_meta_data from public.users
author_res = supabase.table("users").select("email, raw_user_meta_data").eq("id", user["id"]).execute()
metadata = author_res.data.get("raw_user_meta_data") or {}
full_name = metadata.get("full_name")
```

**After:**
```python
# Correct - using full_name column and metadata field from public.users
author_res = supabase.table("users").select("email, full_name, metadata").eq("id", user["id"]).execute()
full_name = author_res.data.get("full_name")
if not full_name:
    metadata = author_res.data.get("metadata") or {}
    full_name = metadata.get("full_name") or metadata.get("name")
```

### Database Migration Required
The `public.users` table must be created using the `ensure_users_table.sql` script.

#### Option 1: Run via Script (Recommended)
```bash
cd apps/backend
python scripts/apply_users_table_migration.py
```

This will display the SQL to run in your Supabase dashboard.

#### Option 2: Manual Application
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to SQL Editor
4. Copy the contents of `apps/backend/scripts/ensure_users_table.sql`
5. Paste and run in the SQL Editor

## What the Migration Does

1. **Creates `public.users` table** with the following schema:
   - `id` (UUID, references auth.users)
   - `email` (TEXT)
   - `full_name` (TEXT) - extracted from auth metadata
   - `avatar_url` (TEXT)
   - `role` (TEXT)
   - `status` (TEXT)
   - `metadata` (JSONB) - copy of raw_user_meta_data
   - Plus timestamps and other fields

2. **Sets up automatic sync** via triggers:
   - When a user signs up in `auth.users`, they're automatically added to `public.users`
   - The `full_name` is extracted from `raw_user_meta_data`

3. **Syncs existing users** from `auth.users` to `public.users`

4. **Creates indexes** for performance

## Files Modified

- `apps/backend/api/requests/api_comments.py` - Fixed to use correct schema
- `apps/backend/scripts/apply_users_table_migration.py` - New migration helper script (created)
- This documentation file (created)

## Testing

After applying the fix:

1. The comments API should no longer throw 500 errors
2. Comments should load properly during slide generation
3. Author names should be correctly displayed in comments

## Verification

Run the migration script with verification:
```bash
cd apps/backend
python scripts/apply_users_table_migration.py
```

Then test the comments endpoint:
```bash
# Replace with your actual deck_id and slide_id
curl -X GET "http://localhost:9090/api/decks/{deck_id}/comments?slideId={slide_id}&status=open" \
  -H "Authorization: Bearer {your_token}"
```

The response should be 200 OK with a list of comments (or empty array if no comments exist).

## Related Files

- `apps/backend/scripts/ensure_users_table.sql` - Database schema and triggers
- `apps/backend/api/requests/api_comments.py` - Comments API implementation
- `apps/backend/utils/supabase.py` - Supabase client utilities

