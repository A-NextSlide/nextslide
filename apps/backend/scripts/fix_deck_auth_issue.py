#!/usr/bin/env python3
"""Fix deck authentication issues"""

import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from supabase import create_client
from dotenv import load_dotenv
import logging
import json

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

def diagnose_deck_issue(deck_uuid: str):
    """Diagnose issues with a specific deck"""
    
    logger.info(f"🔍 Diagnosing deck: {deck_uuid}")
    
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 1. Check if deck exists
    try:
        result = client.table('decks').select('*').eq('uuid', deck_uuid).execute()
        
        if not result.data:
            logger.error(f"❌ Deck {deck_uuid} not found in database")
            return
        
        deck = result.data[0]
        logger.info(f"✅ Deck found in database")
        logger.info(f"   - Name: {deck.get('name', 'Untitled')}")
        logger.info(f"   - User ID: {deck.get('user_id', 'NULL')}")
        logger.info(f"   - Status: {deck.get('status', {}).get('state', 'unknown')}")
        logger.info(f"   - Created: {deck.get('created_at', 'unknown')}")
        
        # 2. Check if user_id is missing
        if not deck.get('user_id'):
            logger.warning("⚠️  Deck has no user_id - this will cause RLS issues!")
            logger.info("   This is why the frontend can't fetch the deck.")
            
            # Offer to fix it
            logger.info("\n💡 To fix this deck:")
            logger.info("1. Get the user ID from your frontend (check localStorage)")
            logger.info("2. Run: python scripts/fix_deck_auth_issue.py <deck_uuid> <user_id>")
        else:
            logger.info("✅ Deck has user_id set")
            
    except Exception as e:
        logger.error(f"Error checking deck: {e}")

def fix_deck_user_id(deck_uuid: str, user_id: str):
    """Fix a deck by setting its user_id"""
    
    logger.info(f"🔧 Fixing deck {deck_uuid} - setting user_id to {user_id}")
    
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    try:
        # Update the deck with the user_id
        result = client.table('decks').update({
            'user_id': user_id
        }).eq('uuid', deck_uuid).execute()
        
        if result.data:
            logger.info("✅ Successfully updated deck with user_id")
            logger.info(f"   Deck should now be accessible by user {user_id}")
        else:
            logger.error("❌ Failed to update deck")
            
    except Exception as e:
        logger.error(f"Error updating deck: {e}")

def check_user_auth(token: str):
    """Check what user a token belongs to"""
    
    from services.supabase_auth_service import get_auth_service
    
    try:
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)
        
        if user:
            logger.info(f"✅ Token is valid for user: {user.get('id')}")
            logger.info(f"   Email: {user.get('email')}")
            return user.get('id')
        else:
            logger.error("❌ Token is invalid or expired")
            return None
    except Exception as e:
        logger.error(f"Error checking token: {e}")
        return None

def main():
    """Main function"""
    
    if len(sys.argv) < 2:
        logger.info("Usage:")
        logger.info("  Diagnose deck: python scripts/fix_deck_auth_issue.py <deck_uuid>")
        logger.info("  Fix deck: python scripts/fix_deck_auth_issue.py <deck_uuid> <user_id>")
        logger.info("  Check token: python scripts/fix_deck_auth_issue.py --check-token <token>")
        logger.info("\nExample deck UUID from your error: 7c09cc8e-4c92-48c6-91b0-656e01051b33")
        return
    
    if sys.argv[1] == "--check-token" and len(sys.argv) > 2:
        check_user_auth(sys.argv[2])
    elif len(sys.argv) == 2:
        # Just diagnose
        diagnose_deck_issue(sys.argv[1])
    elif len(sys.argv) == 3:
        # Fix the deck
        fix_deck_user_id(sys.argv[1], sys.argv[2])

if __name__ == "__main__":
    main()