#!/usr/bin/env python3
"""
Fix RLS issues and test deck operations
"""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.supabase_auth_service import get_auth_service
from utils.supabase import get_supabase_client, get_deck
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_rls_policies():
    """Check current RLS policies on decks and deck_collaborators tables"""
    try:
        # Get service client (bypasses RLS)
        from supabase import create_client
        supabase_url = os.getenv("SUPABASE_URL", "")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        
        if not supabase_url or not service_role_key:
            logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
            return False
            
        service_client = create_client(supabase_url, service_role_key)
        
        # Check policies
        logger.info("\n=== Checking RLS Policies ===")
        
        # Query to get policies
        query = """
        SELECT 
            schemaname,
            tablename,
            policyname,
            permissive,
            roles,
            cmd,
            qual,
            with_check
        FROM pg_policies 
        WHERE tablename IN ('decks', 'deck_collaborators')
        ORDER BY tablename, policyname;
        """
        
        result = service_client.rpc('query_policies', {'query': query}).execute()
        
        if result.data:
            for policy in result.data:
                logger.info(f"\nTable: {policy['tablename']}")
                logger.info(f"Policy: {policy['policyname']}")
                logger.info(f"Command: {policy['cmd']}")
                logger.info(f"USING: {policy['qual']}")
                if policy['with_check']:
                    logger.info(f"WITH CHECK: {policy['with_check']}")
        else:
            logger.warning("No policies found or unable to query policies")
            
        return True
        
    except Exception as e:
        logger.error(f"Error checking policies: {e}")
        return False

def test_deck_operations(test_user_email: str = "test@example.com"):
    """Test deck creation and retrieval"""
    try:
        auth_service = get_auth_service()
        supabase = get_supabase_client()
        
        logger.info(f"\n=== Testing Deck Operations for {test_user_email} ===")
        
        # 1. Test anonymous deck creation (no auth)
        logger.info("\n1. Testing anonymous deck creation...")
        import uuid
        test_deck_id = str(uuid.uuid4())
        
        anonymous_deck = {
            "uuid": test_deck_id,
            "name": "Test Anonymous Deck",
            "user_id": None,  # Anonymous
            "slides": [],
            "status": {"state": "draft"},
            "data": {}
        }
        
        try:
            result = supabase.table("decks").insert(anonymous_deck).execute()
            logger.info(f"✅ Created anonymous deck: {test_deck_id}")
        except Exception as e:
            logger.error(f"❌ Failed to create anonymous deck: {e}")
            
        # 2. Test retrieving the anonymous deck
        logger.info("\n2. Testing anonymous deck retrieval...")
        retrieved = get_deck(test_deck_id)
        if retrieved:
            logger.info(f"✅ Retrieved anonymous deck: {retrieved['name']}")
        else:
            logger.error("❌ Failed to retrieve anonymous deck")
            
        # 3. Clean up test deck
        try:
            supabase.table("decks").delete().eq("uuid", test_deck_id).execute()
            logger.info("✅ Cleaned up test deck")
        except:
            pass
            
        # 4. Check for any stuck decks
        logger.info("\n3. Checking for problematic decks...")
        
        # Get service client to bypass RLS
        from supabase import create_client
        supabase_url = os.getenv("SUPABASE_URL", "")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        
        service_client = create_client(supabase_url, service_role_key)
        
        # Check for decks with invalid states
        problem_decks = service_client.table("decks")\
            .select("uuid, name, user_id, created_at, status")\
            .in_("uuid", ["8d57a642-9a23-4c0a-97b8-637eaf8fafdc", "7827f074-b8ac-42db-b508-e9944760c83b"])\
            .execute()
            
        if problem_decks.data:
            logger.info(f"\nFound {len(problem_decks.data)} problematic decks:")
            for deck in problem_decks.data:
                logger.info(f"  - {deck['uuid']}: {deck['name']} (user: {deck['user_id']})")
        else:
            logger.info("No problematic decks found")
            
        return True
        
    except Exception as e:
        logger.error(f"Error in deck operations test: {e}")
        return False

def apply_rls_fix():
    """Apply the RLS fix migration if needed"""
    try:
        logger.info("\n=== Applying RLS Fix ===")
        
        # Read the migration file
        migration_path = Path(__file__).parent.parent / "supabase" / "migrations" / "20250130_force_fix_rls.sql"
        
        if not migration_path.exists():
            logger.error(f"Migration file not found: {migration_path}")
            return False
            
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
            
        logger.info(f"Read migration from: {migration_path}")
        logger.info("Migration contains RLS fixes for decks and deck_collaborators tables")
        
        # Note: To apply this, you need to run it directly in Supabase SQL editor
        logger.info("\n⚠️  To apply this fix:")
        logger.info("1. Go to your Supabase dashboard")
        logger.info("2. Navigate to SQL Editor")
        logger.info("3. Copy and paste the contents of:")
        logger.info(f"   {migration_path}")
        logger.info("4. Run the migration")
        logger.info("\nThis will reset and fix all RLS policies.")
        
        return True
        
    except Exception as e:
        logger.error(f"Error preparing RLS fix: {e}")
        return False

def main():
    """Main function"""
    logger.info("=== Deck Loading Fix Script ===")
    
    # 1. Check current RLS policies
    # check_rls_policies()
    
    # 2. Test deck operations
    test_deck_operations()
    
    # 3. Show how to apply RLS fix
    apply_rls_fix()
    
    logger.info("\n=== Summary ===")
    logger.info("1. UUID validation has been added to prevent 'undefined' errors")
    logger.info("2. RLS policies need to be fixed in Supabase")
    logger.info("3. Follow the instructions above to apply the fix")

if __name__ == "__main__":
    main() 