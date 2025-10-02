#!/bin/bash

# Script to clean up temporary documentation files from debugging session

echo "Cleaning up temporary documentation files..."

# Files to keep
KEEP_FILES=(
    "EXCEL_AND_IMAGE_PROCESSING_FIXES.md"
    "MULTI_SHEET_EXCEL_FIX.md" 
    "FINAL_FIXES_SUMMARY.md"
    "ASSISTANT_INTEGRATION.md"
)

# Files to remove (temporary debugging docs)
REMOVE_FILES=(
    "CHAT_COMPLETION_DATA_FIX.md"
    "DATA_VS_STYLE_SEPARATION.md"
    "EXCEL_DATA_DEBUGGING_GUIDE.md"
    "EXCEL_DATA_EXTRACTION_COMPLETE.md"
    "EXCEL_DATA_FIXES_SUMMARY.md"
    "EXCEL_DATA_FIX_SUMMARY.md"
    "EXCEL_DATA_USAGE_FIX_V2.md"
    "EXCEL_EXTRACTION_FIXES_SUMMARY.md"
    "FIX_WATCHLIST_DATA_ISSUE.md"
    "GENERIC_DATA_EXTRACTION.md"
    "OPENAI_ASSISTANT_FILE_PROCESSING.md"
    "OPENAI_ENHANCED_FILE_PROCESSING.md"
    "OPENAI_LOGGING_ADDED.md"
)

echo "Files to keep:"
for file in "${KEEP_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    fi
done

echo -e "\nFiles to remove:"
for file in "${REMOVE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  - $file"
    fi
done

# Ask for confirmation
echo -e "\nDo you want to proceed with cleanup? (y/n)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    for file in "${REMOVE_FILES[@]}"; do
        if [ -f "$file" ]; then
            rm "$file"
            echo "Removed: $file"
        fi
    done
    echo "Cleanup complete!"
else
    echo "Cleanup cancelled."
fi 