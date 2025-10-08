#!/bin/bash

# Enable HTML-Inspired Slide Generation
# Usage: ./enable_html_inspired.sh

echo "🎨 Enabling HTML-inspired slide generation..."
echo ""
echo "Setting environment variable: USE_HTML_INSPIRED=true"
export USE_HTML_INSPIRED=true

echo ""
echo "✅ HTML-inspired generation is now ENABLED"
echo ""
echo "To make this permanent, add to your ~/.zshrc or ~/.bashrc:"
echo '  export USE_HTML_INSPIRED=true'
echo ""
echo "Or set in Render dashboard as environment variable:"
echo "  Variable: USE_HTML_INSPIRED"
echo "  Value: true"
echo ""
echo "Now restart your server:"
echo "  python3 api/chat_server.py"
echo ""

