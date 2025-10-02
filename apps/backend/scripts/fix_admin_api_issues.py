#!/usr/bin/env python3
"""
Script to diagnose and fix admin API issues
"""
import os
import sys
import asyncio
from dotenv import load_dotenv

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.supabase import get_supabase_client

load_dotenv()

def check_users_table():
    """Check if users table has the required columns"""
    try:
        supabase = get_supabase_client()
        
        print("🔍 Checking users table structure...")
        
        # Get a sample user
        response = supabase.table("users").select("*").limit(1).execute()
        
        if response.data:
            user = response.data[0]
            print("\n✅ Users table columns found:")
            for key in user.keys():
                print(f"   - {key}: {type(user[key]).__name__}")
            
            # Check for required fields
            required_fields = ["id", "email", "full_name", "role", "status", "created_at"]
            missing_fields = [f for f in required_fields if f not in user]
            
            if missing_fields:
                print(f"\n⚠️  Missing fields: {', '.join(missing_fields)}")
            else:
                print("\n✅ All required fields present")
                
            # Check if full_name is populated
            users_with_names = supabase.table("users").select("id").not_.is_("full_name", "null").execute()
            users_without_names = supabase.table("users").select("id").is_("full_name", "null").execute()
            
            print(f"\n📊 User name statistics:")
            print(f"   - Users with names: {len(users_with_names.data)}")
            print(f"   - Users without names: {len(users_without_names.data)}")
            
        else:
            print("❌ No users found in the database")
            
    except Exception as e:
        print(f"❌ Error checking users table: {str(e)}")

def check_decks_table():
    """Check decks table structure and relationships"""
    try:
        supabase = get_supabase_client()
        
        print("\n🔍 Checking decks table structure...")
        
        # Get a sample deck
        response = supabase.table("decks").select("*").limit(1).execute()
        
        if response.data:
            deck = response.data[0]
            print("\n✅ Decks table columns found:")
            for key in deck.keys():
                value_type = type(deck[key]).__name__
                if key in ["status", "visibility"] and deck[key]:
                    print(f"   - {key}: {value_type} (value: {deck[key]})")
                else:
                    print(f"   - {key}: {value_type}")
            
            # Check if we can join with users
            print("\n🔍 Testing deck-user join...")
            test_join = supabase.table("decks").select("uuid, name, user_id").limit(1).execute()
            
            if test_join.data and test_join.data[0].get("user_id"):
                user_id = test_join.data[0]["user_id"]
                user_check = supabase.table("users").select("email, full_name").eq("id", user_id).single().execute()
                
                if user_check.data:
                    print(f"✅ Successfully joined deck with user: {user_check.data.get('email')}")
                else:
                    print(f"⚠️  User {user_id} not found in public.users table")
            
        else:
            print("❌ No decks found in the database")
            
    except Exception as e:
        print(f"❌ Error checking decks table: {str(e)}")

def populate_missing_user_names():
    """Populate missing user names with email prefix"""
    try:
        supabase = get_supabase_client()
        
        print("\n🔧 Fixing missing user names...")
        
        # Get users without names
        users_without_names = supabase.table("users").select("id, email").is_("full_name", "null").execute()
        
        if users_without_names.data:
            print(f"Found {len(users_without_names.data)} users without names")
            
            for user in users_without_names.data:
                # Use email prefix as name
                email = user.get("email", "")
                name = email.split("@")[0].replace(".", " ").title()
                
                # Update user
                supabase.table("users").update({
                    "full_name": name
                }).eq("id", user["id"]).execute()
                
                print(f"   ✅ Updated {email} -> {name}")
        else:
            print("✅ All users already have names")
            
    except Exception as e:
        print(f"❌ Error updating user names: {str(e)}")

def test_analytics_queries():
    """Test the analytics queries"""
    try:
        supabase = get_supabase_client()
        
        print("\n🔍 Testing analytics queries...")
        
        # Test user count
        total_users = supabase.table("users").select("id", count="exact").execute()
        print(f"✅ Total users: {total_users.count}")
        
        # Test deck count
        total_decks = supabase.table("decks").select("id", count="exact").execute()
        print(f"✅ Total decks: {total_decks.count}")
        
        # Test users with last_sign_in_at
        users_with_signin = supabase.table("users").select("id").not_.is_("last_sign_in_at", "null").execute()
        print(f"✅ Users with login data: {len(users_with_signin.data)}")
        
    except Exception as e:
        print(f"❌ Error testing analytics: {str(e)}")

def main():
    print("🚀 Admin API Issue Diagnosis and Fix")
    print("=" * 50)
    
    # Check table structures
    check_users_table()
    check_decks_table()
    
    # Test analytics
    test_analytics_queries()
    
    # Ask if we should fix missing names
    print("\n" + "=" * 50)
    response = input("\nDo you want to populate missing user names? (y/n): ").strip().lower()
    
    if response == 'y':
        populate_missing_user_names()
    
    print("\n✅ Diagnosis complete!")
    print("\nNext steps:")
    print("1. If users are missing full_name, run the fix")
    print("2. Ensure the admin API is using public.users for joins")
    print("3. Test the endpoints with the test script")

if __name__ == "__main__":
    main()