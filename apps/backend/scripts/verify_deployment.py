#!/usr/bin/env python3
"""
Deployment Verification Script
Run this to check if your deployment is properly configured.
"""

import os
import sys
import importlib

def check_env_vars():
    """Check if required environment variables are set."""
    print("🔍 Checking Environment Variables...")
    
    required_vars = {
        "ANTHROPIC_API_KEY": "Required for AI deck generation",
        "OPENAI_API_KEY": "Required for AI services and image generation",
        "SUPABASE_URL": "Required for database connection",
        "SUPABASE_KEY": "Required for database authentication",
    }
    
    optional_vars = {
        "GROQ_API_KEY": "Optional - for Groq AI services",
        "UNSPLASH_ACCESS_KEY": "Optional - for Unsplash images",
        "SERPAPI_API_KEY": "Optional - for Google image search",
        "PEXELS_API_KEY": "Optional - for Pexels images",
        "LANGSMITH_API_KEY": "Optional - for tracing",
        "ARIZE_PHOENIX_API_KEY": "Optional - for monitoring",
    }
    
    missing_required = []
    missing_optional = []
    
    print("\n✅ Required Variables:")
    for var, desc in required_vars.items():
        if os.getenv(var):
            print(f"  ✓ {var} is set")
        else:
            print(f"  ✗ {var} is MISSING - {desc}")
            missing_required.append(var)
    
    print("\n⚠️  Optional Variables:")
    for var, desc in optional_vars.items():
        if os.getenv(var):
            print(f"  ✓ {var} is set")
        else:
            print(f"  ○ {var} not set - {desc}")
            missing_optional.append(var)
    
    return missing_required, missing_optional

def check_python_version():
    """Check Python version compatibility."""
    print("\n🐍 Checking Python Version...")
    version = sys.version_info
    print(f"  Current: Python {version.major}.{version.minor}.{version.micro}")
    
    if version.major == 3 and version.minor >= 11:
        print("  ✓ Python version is compatible")
        return True
    else:
        print("  ✗ Python 3.11+ is required")
        return False

def check_imports():
    """Check if critical imports work."""
    print("\n📦 Checking Critical Imports...")
    
    critical_imports = [
        ("anthropic", "Anthropic AI SDK"),
        ("openai", "OpenAI SDK"),
        ("supabase", "Supabase client"),
        ("fastapi", "FastAPI framework"),
        ("pydantic", "Pydantic models"),
        ("json_schema_to_pydantic", "JSON Schema converter"),
    ]
    
    failed_imports = []
    
    for module_name, desc in critical_imports:
        try:
            importlib.import_module(module_name)
            print(f"  ✓ {module_name} - {desc}")
        except ImportError as e:
            print(f"  ✗ {module_name} - {desc} - Error: {e}")
            failed_imports.append(module_name)
    
    return failed_imports

def main():
    """Run deployment verification checks."""
    print("🚀 Deployment Verification for Render\n")
    print("=" * 50)
    
    # Check Python version
    python_ok = check_python_version()
    
    # Check environment variables
    missing_required, missing_optional = check_env_vars()
    
    # Check imports
    failed_imports = check_imports()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 SUMMARY:\n")
    
    issues = []
    
    if not python_ok:
        issues.append("❌ Python version incompatible")
    
    if missing_required:
        issues.append(f"❌ Missing {len(missing_required)} required environment variables")
    
    if failed_imports:
        issues.append(f"❌ Failed to import {len(failed_imports)} critical packages")
    
    if issues:
        print("⚠️  DEPLOYMENT ISSUES FOUND:")
        for issue in issues:
            print(f"  {issue}")
        print("\n🔧 Fix these issues before deploying to Render.")
        sys.exit(1)
    else:
        print("✅ All checks passed! Ready for deployment.")
        if missing_optional:
            print(f"\n💡 Note: {len(missing_optional)} optional environment variables are not set.")
            print("   Some features may be limited.")
        sys.exit(0)

if __name__ == "__main__":
    main() 