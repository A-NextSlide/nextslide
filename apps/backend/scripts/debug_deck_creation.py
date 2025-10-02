#!/usr/bin/env python3
"""Debug deck creation issues with Supabase"""

import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from supabase import create_client
from dotenv import load_dotenv
import logging
import json

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

def test_supabase_connection():
    """Test basic Supabase connection"""
    try:
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✅ Successfully connected to Supabase")
        return client
    except Exception as e:
        logger.error(f"❌ Failed to connect to Supabase: {e}")
        return None

def check_rls_policies(client):
    """Check RLS policies on decks table"""
    try:
        # Get current user info
        result = client.auth.get_user()
        if result:
            logger.info(f"Current user: {result}")
        
        # Test deck queries
        logger.info("\n🔍 Testing deck queries...")
        
        # Try to query decks
        decks_result = client.table('decks').select('*').execute()
        logger.info(f"Decks query result: {len(decks_result.data)} decks found")
        
        return True
    except Exception as e:
        logger.error(f"❌ RLS policy error: {e}")
        return False

def test_deck_creation(client, user_id=None):
    """Test creating a new deck"""
    try:
        import uuid
        deck_uuid = str(uuid.uuid4())
        
        logger.info(f"\n🔨 Testing deck creation with UUID: {deck_uuid}")
        
        deck_data = {
            "uuid": deck_uuid,
            "name": "Test Deck - Debug",
            "status": "draft",
            "outline": {"title": "Test Deck"},
            "slides": []
        }
        
        if user_id:
            deck_data["user_id"] = user_id
            
        # Try to insert deck
        result = client.table('decks').insert(deck_data).execute()
        logger.info(f"✅ Deck created successfully: {result.data}")
        
        # Try to fetch it back
        fetch_result = client.table('decks').select('*').eq('uuid', deck_uuid).execute()
        logger.info(f"✅ Deck fetched successfully: {fetch_result.data}")
        
        # Clean up
        delete_result = client.table('decks').delete().eq('uuid', deck_uuid).execute()
        logger.info("✅ Test deck cleaned up")
        
        return True
    except Exception as e:
        logger.error(f"❌ Deck creation error: {e}")
        logger.error(f"Error details: {type(e).__name__}")
        if hasattr(e, 'response'):
            logger.error(f"Response: {e.response}")
        return False

def check_database_logs(client):
    """Check if we can access database logs for errors"""
    try:
        # This would require admin access to pg_stat_statements or similar
        # For now, just log that we should check Supabase dashboard
        logger.info("\n📋 To see database errors:")
        logger.info("1. Go to your Supabase dashboard")
        logger.info("2. Navigate to Logs > Postgres")
        logger.info("3. Look for recent errors around deck operations")
        logger.info("4. Check for RLS policy violations")
    except Exception as e:
        logger.error(f"Cannot access database logs: {e}")

def main():
    """Run all debug tests"""
    logger.info("🚀 Starting Supabase deck creation debug...")
    logger.info(f"SUPABASE_URL: {SUPABASE_URL}")
    logger.info(f"Using key type: {'SERVICE_KEY' if 'SERVICE_KEY' in str(SUPABASE_KEY)[:20] else 'ANON_KEY'}")
    
    # Test connection
    client = test_supabase_connection()
    if not client:
        return
    
    # Check RLS policies
    check_rls_policies(client)
    
    # Test deck creation
    test_deck_creation(client)
    
    # Provide guidance
    check_database_logs(client)
    
    logger.info("\n💡 Common issues and solutions:")
    logger.info("1. RLS policies blocking operations - check recent migrations")
    logger.info("2. Missing user_id in deck creation - ensure auth is working")
    logger.info("3. Unique constraint violations - check for duplicate UUIDs")
    logger.info("4. Database trigger errors - check Supabase function logs")

if __name__ == "__main__":
    main()