#!/usr/bin/env python3
"""
Apply the ensure_users_table.sql migration to fix the raw_user_meta_data error.

This script ensures that the public.users table exists with the correct schema.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path so we can import from utils
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.supabase import get_supabase_client

try:
    import psycopg2
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False


def apply_migration():
    """Apply the ensure_users_table.sql migration"""
    print("=== Applying Users Table Migration ===\n")
    
    # Read the migration file
    migration_path = Path(__file__).parent / "ensure_users_table.sql"
    
    if not migration_path.exists():
        print(f"❌ Migration file not found: {migration_path}")
        return False
    
    with open(migration_path, 'r') as f:
        migration_sql = f.read()
    
    print(f"✓ Read migration from: {migration_path}")
    print("\nThis migration will:")
    print("  1. Create public.users table if it doesn't exist")
    print("  2. Set up automatic sync from auth.users to public.users")
    print("  3. Sync existing auth.users to public.users")
    print("  4. Create necessary indexes for performance")
    
    # Try to run with psycopg2 if available
    if PSYCOPG2_AVAILABLE:
        database_url = os.getenv('DATABASE_URL') or os.getenv('SUPABASE_DATABASE_URL')
        
        if database_url:
            print(f"\n✓ Found DATABASE_URL, attempting automatic migration...")
            
            try:
                # Connect to database
                conn = psycopg2.connect(database_url)
                conn.autocommit = True
                cursor = conn.cursor()
                
                # Execute migration
                print("  Executing migration SQL...")
                cursor.execute(migration_sql)
                
                cursor.close()
                conn.close()
                
                print("\n✅ Migration applied successfully!")
                return True
                
            except Exception as e:
                print(f"\n❌ Failed to apply migration automatically: {e}")
                print("  Falling back to manual instructions...")
        else:
            print("\n⚠️  DATABASE_URL not found in environment")
            print("  To enable automatic migration, set DATABASE_URL or SUPABASE_DATABASE_URL")
    else:
        print("\n⚠️  psycopg2 not installed")
        print("  To enable automatic migration: pip install psycopg2-binary")
    
    # Fallback: Show manual instructions
    print("\n" + "="*60)
    print("MANUAL MIGRATION INSTRUCTIONS")
    print("="*60)
    print("\nTo apply this migration manually:")
    print("\n1. Go to your Supabase dashboard: https://app.supabase.com")
    print("2. Select your project")
    print("3. Navigate to 'SQL Editor' in the left sidebar")
    print("4. Click 'New query'")
    print("5. Copy and paste the SQL below")
    print("6. Click 'Run' to execute the migration")
    
    print("\n" + "="*60)
    print("SQL TO RUN (copy this):")
    print("="*60)
    print(migration_sql)
    print("="*60)
    
    return False


def verify_migration():
    """Verify that the migration was successful"""
    print("\n=== Verifying Migration ===\n")
    
    try:
        supabase = get_supabase_client()
        
        # Try to query the users table with the correct schema
        result = supabase.table("users").select("id, email, full_name, metadata").limit(1).execute()
        
        print("✓ Successfully queried users table with correct schema")
        print(f"  Found {len(result.data)} user(s)")
        
        if result.data:
            user = result.data[0]
            print(f"\n  Sample user:")
            print(f"    ID: {user.get('id')}")
            print(f"    Email: {user.get('email')}")
            print(f"    Full Name: {user.get('full_name')}")
            print(f"    Has Metadata: {bool(user.get('metadata'))}")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to verify migration: {e}")
        print("\nThis is expected if you haven't run the migration yet.")
        print("Please follow the steps above to apply the migration.")
        return False


def main():
    """Main function"""
    print("\n" + "="*60)
    print("Users Table Migration Tool")
    print("="*60 + "\n")
    
    # Apply migration (will show instructions or apply automatically)
    success = apply_migration()
    
    # If migration was successful, verify automatically
    if success:
        verify_migration()
    else:
        # Ask if user wants to verify (after manual migration)
        print("\n\nAfter running the migration in Supabase SQL Editor,")
        try:
            verify = input("Would you like to verify the migration? (y/n): ").strip().lower()
            
            if verify == 'y':
                verify_migration()
        except (KeyboardInterrupt, EOFError):
            pass
    
    print("\n✓ Done!")


if __name__ == "__main__":
    main()

