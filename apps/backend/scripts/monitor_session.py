#!/usr/bin/env python3
"""
Session Monitoring Script
Helps debug authentication and session issues
"""

import os
import sys
import json
import time
import httpx
from datetime import datetime, timedelta
import jwt
from typing import Optional, Dict, Any

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.supabase_auth_service import get_auth_service
from services.session_manager import get_session_manager
from utils.supabase import get_supabase_client

def decode_token(token: str) -> Dict[str, Any]:
    """Decode JWT token without verification (for debugging)"""
    try:
        # Decode without verification to inspect claims
        payload = jwt.decode(token, options={"verify_signature": False})
        
        # Convert timestamps to readable format
        if 'exp' in payload:
            payload['exp_readable'] = datetime.fromtimestamp(payload['exp']).isoformat()
            payload['expires_in'] = (datetime.fromtimestamp(payload['exp']) - datetime.now()).total_seconds() / 60
        
        if 'iat' in payload:
            payload['iat_readable'] = datetime.fromtimestamp(payload['iat']).isoformat()
            
        return payload
    except Exception as e:
        return {"error": str(e)}

def test_token_validation(token: str):
    """Test token validation through different methods"""
    print("\n=== Testing Token Validation ===")
    
    # Test 1: Direct Supabase validation
    print("\n1. Direct Supabase Validation:")
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token)
    if user:
        print(f"✅ Valid - User ID: {user['id']}, Email: {user['email']}")
    else:
        print("❌ Invalid token")
    
    # Test 2: Session Manager validation (with caching)
    print("\n2. Session Manager Validation:")
    session_manager = get_session_manager()
    cached_user = session_manager.validate_token(token)
    if cached_user:
        print(f"✅ Valid - User ID: {cached_user['id']}, Email: {cached_user['email']}")
        print(f"   Cache expiry: {cached_user.get('_cache_expiry', 'N/A')}")
    else:
        print("❌ Invalid token")
    
    # Test 3: Token decoding
    print("\n3. Token Claims:")
    claims = decode_token(token)
    if 'error' not in claims:
        print(f"   Subject: {claims.get('sub')}")
        print(f"   Email: {claims.get('email')}")
        print(f"   Issued: {claims.get('iat_readable')}")
        print(f"   Expires: {claims.get('exp_readable')}")
        print(f"   Time remaining: {claims.get('expires_in', 0):.1f} minutes")
        
        if claims.get('expires_in', 0) < 5:
            print("   ⚠️  Token expires in less than 5 minutes!")
    else:
        print(f"   Error decoding: {claims['error']}")

def test_deck_attribution(token: str):
    """Test deck attribution for authenticated user"""
    print("\n=== Testing Deck Attribution ===")
    
    # Get user
    session_manager = get_session_manager()
    user = session_manager.validate_token(token)
    
    if not user:
        print("❌ No valid user for deck attribution test")
        return
        
    user_id = user['id']
    print(f"Testing for user: {user_id}")
    
    # Check existing decks
    supabase = get_supabase_client()
    
    # Get decks owned by user
    owned = supabase.table("decks").select("uuid, name, created_at, user_id").eq("user_id", user_id).execute()
    print(f"\nOwned decks: {len(owned.data) if owned.data else 0}")
    
    if owned.data:
        for deck in owned.data[:3]:  # Show first 3
            print(f"  - {deck['name']} (UUID: {deck['uuid'][:8]}...)")
    
    # Get deck associations
    associations = supabase.table("user_decks").select("deck_uuid, created_at").eq("user_id", user_id).execute()
    print(f"\nDeck associations: {len(associations.data) if associations.data else 0}")
    
    # Check for orphaned decks (no user_id)
    orphaned = supabase.table("decks").select("uuid, name, created_at").is_("user_id", "null").limit(5).execute()
    if orphaned.data:
        print(f"\n⚠️  Found {len(orphaned.data)} orphaned decks (no user_id):")
        for deck in orphaned.data:
            print(f"  - {deck['name']} (UUID: {deck['uuid'][:8]}..., Created: {deck['created_at']})")

def monitor_session(token: str, interval: int = 60):
    """Monitor session status over time"""
    print(f"\n=== Monitoring Session (checking every {interval}s) ===")
    print("Press Ctrl+C to stop\n")
    
    session_manager = get_session_manager()
    
    try:
        while True:
            # Clear any cached data for fresh check
            session_manager.clear_token_cache(token)
            
            # Validate token
            user = session_manager.validate_token(token)
            
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            if user:
                # Decode token for expiry info
                claims = decode_token(token)
                time_left = claims.get('expires_in', 0)
                
                print(f"[{timestamp}] ✅ Session valid - User: {user['email']} - Expires in: {time_left:.1f} min")
                
                if time_left < 10:
                    print(f"[{timestamp}] ⚠️  Token expiring soon! Consider refreshing.")
            else:
                print(f"[{timestamp}] ❌ Session invalid or expired")
                break
            
            time.sleep(interval)
            
    except KeyboardInterrupt:
        print("\nMonitoring stopped")

def main():
    """Main function"""
    print("Session Monitoring Tool")
    print("======================")
    
    if len(sys.argv) < 2:
        print("\nUsage:")
        print("  python monitor_session.py <token>           - Test token validation")
        print("  python monitor_session.py <token> monitor   - Monitor session continuously")
        print("  python monitor_session.py <token> decks     - Test deck attribution")
        print("\nExample:")
        print("  python monitor_session.py eyJhbGc...")
        sys.exit(1)
    
    token = sys.argv[1]
    command = sys.argv[2] if len(sys.argv) > 2 else "test"
    
    if command == "monitor":
        monitor_session(token)
    elif command == "decks":
        test_deck_attribution(token)
    else:
        # Default: test token
        test_token_validation(token)
        test_deck_attribution(token)

if __name__ == "__main__":
    main() 