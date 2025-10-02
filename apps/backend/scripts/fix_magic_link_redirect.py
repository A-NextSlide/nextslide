#!/usr/bin/env python3
"""
Fix magic link redirect URL to match frontend expectations
"""
import os
import sys
from pathlib import Path

def fix_magic_link_redirect():
    """Update the magic link redirect URL in supabase_auth_service.py"""
    
    service_file = Path("services/supabase_auth_service.py")
    
    if not service_file.exists():
        print("❌ Error: services/supabase_auth_service.py not found")
        return False
        
    print("🔧 Fixing magic link redirect URL...")
    
    # Read the file
    with open(service_file, 'r') as f:
        content = f.read()
    
    # Replace the redirect URL
    old_redirect = '"email_redirect_to": f"{os.getenv(\'FRONTEND_URL\', \'http://localhost:8080\')}/magic-link-verify"'
    new_redirect = '"email_redirect_to": f"{os.getenv(\'FRONTEND_URL\', \'http://localhost:8080\')}/auth-callback"'
    
    if old_redirect in content:
        content = content.replace(old_redirect, new_redirect)
        
        # Write back
        with open(service_file, 'w') as f:
            f.write(content)
            
        print("✅ Fixed redirect URL: /magic-link-verify → /auth-callback")
        return True
    else:
        print("⚠️  Redirect URL not found or already fixed")
        
        # Check current state
        if new_redirect in content:
            print("✓ Redirect URL is already set to /auth-callback")
        else:
            print("❌ Could not find the expected redirect configuration")
            
        return False

def check_current_configuration():
    """Display current configuration"""
    print("\n📋 Current Configuration:")
    print(f"   FRONTEND_URL: {os.getenv('FRONTEND_URL', 'Not set (default: http://localhost:8080)')}")
    print(f"   SUPABASE_URL: {os.getenv('SUPABASE_URL', 'Not set')}")
    
    # Check if in production
    if os.getenv('FRONTEND_URL', '').startswith('https://'):
        print("\n⚠️  Production Environment Detected!")
        print("   Make sure your Supabase project has the correct redirect URLs configured:")
        print(f"   - {os.getenv('FRONTEND_URL')}/auth-callback")

def main():
    print("=" * 60)
    print("MAGIC LINK REDIRECT FIX")
    print("=" * 60)
    
    # Check configuration
    check_current_configuration()
    
    # Apply fix
    print()
    if fix_magic_link_redirect():
        print("\n✅ Fix applied successfully!")
        print("\nNext steps:")
        print("1. Restart your API server")
        print("2. Test sending a new magic link")
        print("3. Ensure your frontend handles /auth-callback route correctly")
    else:
        print("\n⚠️  No changes were made")
        
    print("\n📝 Additional Notes:")
    print("- PKCE tokens (like yours) are handled by Supabase's auth flow")
    print("- The frontend should use supabase.auth.getSessionFromUrl()")
    print("- Check Supabase Dashboard > Authentication > URL Configuration")

if __name__ == "__main__":
    main()