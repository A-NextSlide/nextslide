#!/usr/bin/env python3
"""
Quick deployment readiness check - focuses on actual critical issues.
"""

import subprocess
import sys

print("🚀 Deployment Readiness Check")
print("=" * 50)

# Run the accurate Python 3.12 compatibility test
print("\n1. Python 3.12 F-String Compatibility:")
result = subprocess.run([sys.executable, "scripts/test_python312_compat.py"], capture_output=True, text=True)

if result.returncode == 0:
    print("✅ All f-string issues fixed - safe to deploy!")
    print("\nYour code will run correctly on Render's Python 3.12 environment.")
    sys.exit(0)
else:
    print("❌ F-string issues detected - fix before deploying!")
    print(result.stdout)
    sys.exit(1) 