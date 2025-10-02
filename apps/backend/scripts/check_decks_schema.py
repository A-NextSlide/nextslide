#!/usr/bin/env python3
"""
Check the current schema of the decks table
"""
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase import get_supabase_client
from dotenv import load_dotenv

load_dotenv()

def check_decks_schema():
    """Check what columns exist in the decks table"""
    supabase = get_supabase_client()
    
    try:
        # Try to get a deck with all columns
        result = supabase.table("decks").select("*").limit(1).execute()
        
        if result.data and len(result.data) > 0:
            columns = list(result.data[0].keys())
            print("Columns in decks table:")
            for col in sorted(columns):
                print(f"  - {col}")
        else:
            # No data, try to insert a minimal record to see what fails
            print("No decks found. Checking schema by attempting insert...")
            
            test_data = {
                "uuid": "test-schema-check",
                "name": "Schema Test",
                "slides": []
            }
            
            try:
                result = supabase.table("decks").insert(test_data).execute()
                print("Minimal insert succeeded. Basic columns exist.")
                # Clean up
                supabase.table("decks").delete().eq("uuid", "test-schema-check").execute()
            except Exception as e:
                print(f"Insert failed: {e}")
                
    except Exception as e:
        print(f"Error checking schema: {e}")

if __name__ == "__main__":
    check_decks_schema()