#!/usr/bin/env python3
"""
Debug token validation issues with Supabase
"""
import os
import httpx
import asyncio
from dotenv import load_dotenv
import json

load_dotenv()

async def debug_token_validation():
    """Debug why token validation is failing"""
    
    print("=" * 60)
    print("TOKEN VALIDATION DEBUG")
    print("=" * 60)
    
    # Check configuration
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
    
    print("🔧 Configuration:")
    print(f"SUPABASE_URL: {supabase_url}")
    print(f"SUPABASE_KEY: {supabase_key[:30]}..." if supabase_key else "SUPABASE_KEY: Not set")
    print(f"SUPABASE_ANON_KEY: {supabase_anon_key[:30]}..." if supabase_anon_key else "SUPABASE_ANON_KEY: Not set")
    print(f"SUPABASE_SERVICE_KEY: {supabase_service_key[:30]}..." if supabase_service_key else "SUPABASE_SERVICE_KEY: Not set")
    
    # The key being used for validation
    validation_key = supabase_anon_key or supabase_key
    print(f"\n📌 Key used for validation: {'SUPABASE_ANON_KEY' if supabase_anon_key else 'SUPABASE_KEY'}")
    
    if not supabase_url or not validation_key:
        print("\n❌ Missing required configuration!")
        return
        
    print("\n🔍 Testing token validation endpoint directly:")
    print(f"URL: {supabase_url}/auth/v1/user")
    
    # Test with different scenarios
    async with httpx.AsyncClient() as client:
        # Test 1: Invalid token
        print("\n1️⃣ Test with invalid token:")
        headers = {
            "Authorization": "Bearer invalid-token",
            "apikey": validation_key
        }
        
        try:
            response = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers=headers,
                timeout=5.0
            )
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
        except Exception as e:
            print(f"   Error: {str(e)}")
            
        # Test 2: No auth header, just API key
        print("\n2️⃣ Test with just API key (no auth header):")
        headers = {
            "apikey": validation_key
        }
        
        try:
            response = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers=headers,
                timeout=5.0
            )
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
        except Exception as e:
            print(f"   Error: {str(e)}")
            
        # Test 3: Check if it's a CORS/domain issue
        print("\n3️⃣ Testing API health endpoint:")
        try:
            response = await client.get(
                f"{supabase_url}/auth/v1/health",
                headers={"apikey": validation_key},
                timeout=5.0
            )
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.text}")
        except Exception as e:
            print(f"   Error: {str(e)}")
            
    print("\n" + "=" * 60)
    print("DIAGNOSIS:")
    print("=" * 60)
    print("\nPossible issues:")
    print("1. The anon key might not match the Supabase project")
    print("2. The Supabase URL might be incorrect")
    print("3. There might be IP restrictions or CORS issues")
    print("4. The key might be a service key instead of anon key")
    print("\nTo fix:")
    print("1. Verify your Supabase project URL is correct")
    print("2. Get the anon key from Supabase Dashboard > Settings > API")
    print("3. Make sure you're using the anon (public) key, not the service key")

if __name__ == "__main__":
    asyncio.run(debug_token_validation())