#!/bin/bash
# Quick pre-commit check to catch common issues

echo "🔍 Quick syntax check..."

# Check for f-strings with # characters
echo "Checking for f-string issues..."
grep -r "f['\"].*#.*['\"]" --include="*.py" . 2>/dev/null | grep -v "__pycache__" | grep -v ".git"

if [ $? -eq 0 ]; then
    echo "⚠️  WARNING: Found f-strings containing '#' characters!"
    echo "These will cause syntax errors on deployment."
    echo "Fix by extracting hex colors to variables first."
fi

# Quick compile check on critical files
echo ""
echo "Compiling critical files..."
python -m py_compile agents/deck_composer.py 2>&1
if [ $? -ne 0 ]; then
    echo "❌ deck_composer.py has syntax errors!"
    exit 1
fi

python -m py_compile api/chat_server.py 2>&1
if [ $? -ne 0 ]; then
    echo "❌ chat_server.py has syntax errors!"
    exit 1
fi

echo "✅ Quick check passed!" 