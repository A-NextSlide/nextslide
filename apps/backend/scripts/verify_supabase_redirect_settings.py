#!/usr/bin/env python3
"""
Verify Supabase redirect settings are configured correctly
"""
import os
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

async def verify_redirect_settings():
    """Test magic link generation with proper redirects"""
    
    print("=" * 60)
    print("VERIFYING SUPABASE REDIRECT SETTINGS")
    print("=" * 60)
    
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    frontend_url = os.getenv("FRONTEND_URL", "https://nextslide.ai")
    
    if not supabase_url or not supabase_key:
        print("❌ Missing Supabase credentials")
        return
        
    print(f"Frontend URL: {frontend_url}")
    print(f"Supabase URL: {supabase_url}")
    print()
    
    # Test redirect URLs
    test_redirects = [
        f"{frontend_url}/auth-callback",
        f"{frontend_url}/magic-link-verify",
        "http://localhost:8080/auth-callback",
        "http://localhost:5173/auth-callback"
    ]
    
    print("Testing redirect URLs:")
    print("(These should all be whitelisted in Supabase Dashboard)")
    print()
    
    supabase: Client = create_client(supabase_url, supabase_key)
    
    for redirect_url in test_redirects:
        print(f"Testing: {redirect_url}")
        try:
            # Try to generate a magic link with this redirect
            response = supabase.auth.sign_in_with_otp({
                "email": "test@example.com",
                "options": {
                    "email_redirect_to": redirect_url,
                    "should_create_user": False  # Don't actually create user
                }
            })
            print(f"  ✓ Redirect allowed")
        except Exception as e:
            error_msg = str(e)
            if "rate limit" in error_msg.lower():
                print(f"  ⚠️  Rate limited (this is OK)")
            elif "redirect" in error_msg.lower():
                print(f"  ❌ Redirect not allowed! Add to Supabase whitelist")
            else:
                print(f"  ? Error: {error_msg}")
        print()
    
    print("\n" + "=" * 60)
    print("CHECKLIST:")
    print("=" * 60)
    print("□ Site URL is set to: https://nextslide.ai")
    print("□ All redirect URLs above are whitelisted")
    print("□ Email provider is enabled")
    print("□ Magic links are enabled")
    print("□ Email templates use correct variables")
    print("\nIf any redirects failed, add them in:")
    print("Supabase Dashboard > Authentication > URL Configuration > Redirect URLs")

if __name__ == "__main__":
    asyncio.run(verify_redirect_settings())