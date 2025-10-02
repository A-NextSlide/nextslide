#!/usr/bin/env python3
"""
Fix Supabase authentication validation issue
"""
import os
import sys
from pathlib import Path

def check_environment_variables():
    """Check which Supabase environment variables are set"""
    print("🔍 Checking Supabase Environment Variables:")
    print("-" * 60)
    
    vars_to_check = [
        "SUPABASE_URL",
        "SUPABASE_KEY", 
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_KEY",
        "SUPABASE_JWT_SECRET"
    ]
    
    found_vars = {}
    for var in vars_to_check:
        value = os.getenv(var)
        if value:
            preview = f"{value[:20]}...{value[-4:]}" if len(value) > 24 else value
            found_vars[var] = preview
            print(f"✅ {var}: {preview}")
        else:
            print(f"❌ {var}: Not set")
    
    print("\n📝 Recommendations:")
    if "SUPABASE_ANON_KEY" not in found_vars and "SUPABASE_KEY" in found_vars:
        print("- Your SUPABASE_KEY might be the anon key. Consider renaming it to SUPABASE_ANON_KEY")
    
    if "SUPABASE_SERVICE_KEY" not in found_vars:
        print("- SUPABASE_SERVICE_KEY is needed for server-side operations")
        
    return found_vars

def fix_session_manager():
    """Fix the session_manager.py to use the correct environment variable"""
    session_file = Path("services/session_manager.py")
    
    if not session_file.exists():
        print("❌ services/session_manager.py not found")
        return False
        
    print("\n🔧 Fixing session_manager.py...")
    
    with open(session_file, 'r') as f:
        content = f.read()
    
    # Check current state
    if 'self.key = os.getenv("SUPABASE_KEY")' in content:
        # Fix to use SUPABASE_ANON_KEY with fallback
        new_content = content.replace(
            'self.key = os.getenv("SUPABASE_KEY")',
            'self.key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")'
        )
        
        with open(session_file, 'w') as f:
            f.write(new_content)
            
        print("✅ Fixed session_manager.py to use SUPABASE_ANON_KEY")
        return True
    else:
        print("⚠️  session_manager.py already fixed or has different structure")
        return False

def create_env_template():
    """Create a template .env file with proper variable names"""
    template = """# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_anon_public_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here

# Frontend URL
FRONTEND_URL=https://nextslide.ai

# Other services...
"""
    
    print("\n📄 Recommended .env structure:")
    print("-" * 60)
    print(template)

def main():
    print("=" * 60)
    print("SUPABASE AUTH VALIDATION FIX")
    print("=" * 60)
    
    # Check environment
    found_vars = check_environment_variables()
    
    # Apply fix
    if fix_session_manager():
        print("\n✅ Fix applied!")
        print("\n⚠️  IMPORTANT: You need to restart your API server for changes to take effect")
        
        # Additional guidance based on found variables
        if "SUPABASE_KEY" in found_vars and "SUPABASE_ANON_KEY" not in found_vars:
            print("\n🔄 You should also:")
            print("1. Rename SUPABASE_KEY to SUPABASE_ANON_KEY in your .env file")
            print("2. Add SUPABASE_SERVICE_KEY with your service role key")
            print("3. Restart the server")
    
    # Show template
    create_env_template()
    
    print("\n✅ Script completed!")

if __name__ == "__main__":
    main()