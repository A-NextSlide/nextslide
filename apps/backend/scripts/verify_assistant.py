#!/usr/bin/env python3
"""
Verify OpenAI Assistant Configuration

This script verifies that the OpenAI assistant is properly configured
and shows how the extracted data flows through the system.
"""

import os
import sys
import asyncio
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from services.openai_service import OpenAIService

async def verify_assistant():
    """Verify the OpenAI assistant configuration"""
    
    print("\n=== OpenAI Assistant Configuration ===")
    
    # Check environment variable
    assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
    
    if not assistant_id:
        print("❌ OPENAI_ASSISTANT_ID not set in environment")
        print("   Please add OPENAI_ASSISTANT_ID to your .env file")
        return False
    
    print(f"✓ Assistant ID from environment: {assistant_id}")
    
    # Verify it looks like a valid assistant ID
    if not (assistant_id.startswith('asst_') and len(assistant_id) > 10):
        print(f"⚠️  Warning: Assistant ID format looks incorrect: {assistant_id}")
        print("   Assistant IDs should start with 'asst_' and be longer than 10 characters")
    else:
        print("✓ Assistant ID format is valid")
    
    # Initialize OpenAI service
    try:
        service = OpenAIService()
        
        if service.initialized:
            print("✓ OpenAI service initialized successfully")
            print(f"  - API Key: {'Set' if service.api_key else 'Not set'}")
            print(f"  - Base URL: {service.base_url}")
            print(f"  - Model: {service.model}")
            print(f"  - Assistant ID loaded: {service.assistant_id}")
            
            # Check assistant tools
            await service._ensure_assistant_tools_checked()
            print(f"  - Code Interpreter: {'Available' if service.assistant_has_code_interpreter else 'Not available'}")
            
        else:
            print("❌ OpenAI service failed to initialize")
            return False
            
    except Exception as e:
        print(f"❌ Error initializing OpenAI service: {e}")
        return False
    
    print("\n=== File Analysis Flow ===")
    print("When files are uploaded:")
    print("1. Excel/CSV files → Assistant with code_interpreter → extractedData")
    print("2. Images → Vision API → image interpretation → taggedMedia") 
    print("3. PDFs/Docs → Assistant with file_search → content extraction")
    print("\nThe extracted data is then:")
    print("• Included in SlideOutline.extractedData for charts")
    print("• Passed to slide content generation via context")
    print("• Used to create data visualizations automatically")
    
    return True

async def test_file_analysis():
    """Test file analysis with a sample"""
    print("\n=== Testing File Analysis Integration ===")
    
    # This shows how the assistant analyzes files
    print("Example flow for Excel file:")
    print("1. User uploads sales_data.xlsx")
    print("2. Assistant analyzes with code_interpreter")
    print("3. Extracts data like:")
    print("   {")
    print('     "source": "Sales Data 2024",')
    print('     "chartType": "line",')
    print('     "data": [{"x": "Q1", "y": 1500}, {"x": "Q2", "y": 1800}, ...]')
    print("   }")
    print("4. This extractedData is included in slide content generation")
    print("5. Chart is automatically created from the data")

def main():
    """Main function"""
    print("OpenAI Assistant Verification Tool")
    print("=================================")
    
    # Load environment variables from .env file
    from dotenv import load_dotenv
    load_dotenv()
    
    # Run verification
    success = asyncio.run(verify_assistant())
    
    if success:
        print("\n✅ Assistant configuration verified!")
        print("\nYour assistant is properly configured in the .env file.")
        print("The assistant will be used to:")
        print("• Analyze Excel/CSV files for data extraction")
        print("• Process images with vision capabilities")
        print("• Extract content from PDFs and documents")
    else:
        print("\n❌ Configuration issues found. Please fix the issues above.")
        print("\nMake sure your .env file contains:")
        print("OPENAI_ASSISTANT_ID=your_assistant_id_here")
        sys.exit(1)

if __name__ == "__main__":
    main() 