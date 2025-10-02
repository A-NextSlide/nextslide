#!/usr/bin/env python3
"""
Debug and test magic link authentication issues
"""
import os
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client
import json

# Load environment variables
load_dotenv()

class MagicLinkDebugger:
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_ANON_KEY")
        self.frontend_url = os.getenv("FRONTEND_URL", "https://nextslide.ai")
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Missing Supabase credentials in environment")
            
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        
    def check_configuration(self):
        """Check current configuration"""
        print("=" * 60)
        print("CONFIGURATION CHECK")
        print("=" * 60)
        print(f"Supabase URL: {self.supabase_url}")
        print(f"Frontend URL: {self.frontend_url}")
        print(f"Environment: {os.getenv('NODE_ENV', 'development')}")
        print()
        
    async def test_magic_link_generation(self, email: str):
        """Test generating a magic link"""
        print("=" * 60)
        print("TESTING MAGIC LINK GENERATION")
        print("=" * 60)
        print(f"Email: {email}")
        print(f"Timestamp: {datetime.now().isoformat()}")
        
        try:
            # Method 1: Using Supabase OTP with correct redirect
            print("\n1. Testing Supabase OTP method:")
            response = self.supabase.auth.sign_in_with_otp({
                "email": email,
                "options": {
                    "email_redirect_to": f"{self.frontend_url}/auth-callback"
                }
            })
            print(f"   ✓ OTP request sent")
            print(f"   Response: {json.dumps(response, indent=2)}")
            
        except Exception as e:
            print(f"   ✗ Error: {str(e)}")
            
    async def verify_pkce_token(self, token: str):
        """Verify a PKCE token from Supabase"""
        print("\n=" * 60)
        print("VERIFYING PKCE TOKEN")
        print("=" * 60)
        print(f"Token type: {'PKCE' if token.startswith('pkce_') else 'Unknown'}")
        print(f"Token preview: {token[:20]}...")
        
        try:
            # This is how Supabase handles PKCE tokens
            # The token should be verified through the Supabase Auth UI redirect flow
            print("\nPKCE tokens are verified through Supabase's redirect flow.")
            print("The token should be handled by the frontend's auth-callback route.")
            print("\nFrontend should:")
            print("1. Receive the token in the URL")
            print("2. Use supabase.auth.getSessionFromUrl() or similar")
            print("3. Store the session in local storage")
            print("4. Redirect to the app")
            
        except Exception as e:
            print(f"Error: {str(e)}")
            
    def check_auth_settings(self):
        """Check Supabase auth settings"""
        print("\n=" * 60)
        print("SUPABASE AUTH SETTINGS")
        print("=" * 60)
        print("\nIMPORTANT: Check these settings in Supabase Dashboard:")
        print("1. Authentication > URL Configuration")
        print(f"   - Site URL should be: {self.frontend_url}")
        print(f"   - Redirect URLs should include: {self.frontend_url}/auth-callback")
        print("\n2. Authentication > Email Templates")
        print("   - Magic Link template should use {{ .SiteURL }}/auth-callback")
        print("   - Or use {{ .RedirectTo }} if provided")
        print("\n3. Authentication > Providers")
        print("   - Email provider should be enabled")
        print("   - Magic Link should be enabled")

def main():
    """Main debug function"""
    try:
        debugger = MagicLinkDebugger()
        
        # Check configuration
        debugger.check_configuration()
        
        # Check auth settings
        debugger.check_auth_settings()
        
        # Interactive section
        print("\n" + "=" * 60)
        print("INTERACTIVE DEBUG")
        print("=" * 60)
        
        choice = input("\nWhat would you like to test?\n1. Generate new magic link\n2. Debug existing PKCE token\n3. Exit\n\nChoice: ").strip()
        
        if choice == "1":
            email = input("Enter email address: ").strip()
            if email:
                asyncio.run(debugger.test_magic_link_generation(email))
                
        elif choice == "2":
            print("\nPaste your PKCE token (from the URL after 'token=')")
            token = input("Token: ").strip()
            if token:
                asyncio.run(debugger.verify_pkce_token(token))
                
        print("\n✅ Debug session completed")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()