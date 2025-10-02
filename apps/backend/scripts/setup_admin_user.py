#!/usr/bin/env python3
"""
Script to set up an admin user in the database
"""
import os
import sys
from dotenv import load_dotenv

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.supabase import get_supabase_client

load_dotenv()

def setup_admin_user(email: str):
    """
    Update a user to have admin role
    """
    try:
        supabase = get_supabase_client()
        
        # First check if user exists
        user_response = supabase.table("users").select("id, email, role").eq("email", email).single().execute()
        
        if not user_response.data:
            print(f"❌ User with email '{email}' not found.")
            print("   Please create an account first by signing up through the application.")
            return False
        
        user = user_response.data
        current_role = user.get("role", "user")
        
        if current_role == "admin":
            print(f"✅ User '{email}' is already an admin.")
            return True
        
        # Update user role to admin
        update_response = supabase.table("users").update({
            "role": "admin",
            "permissions": ["all"]  # You can customize permissions as needed
        }).eq("id", user["id"]).execute()
        
        if update_response.data:
            print(f"✅ Successfully updated user '{email}' to admin role.")
            print(f"   User ID: {user['id']}")
            print(f"   Previous role: {current_role}")
            print(f"   New role: admin")
            return True
        else:
            print(f"❌ Failed to update user role.")
            return False
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

def list_users():
    """List all users in the system"""
    try:
        supabase = get_supabase_client()
        
        response = supabase.table("users").select("id, email, role, created_at").order("created_at", desc=True).limit(20).execute()
        
        if response.data:
            print("\n📋 Current users:")
            print(f"{'Email':<40} {'Role':<10} {'Created':<20}")
            print("-" * 70)
            
            for user in response.data:
                email = user.get("email", "N/A")
                role = user.get("role", "user")
                created = user.get("created_at", "N/A")[:10]
                print(f"{email:<40} {role:<10} {created:<20}")
        else:
            print("No users found.")
            
    except Exception as e:
        print(f"❌ Error listing users: {str(e)}")

def main():
    print("🔧 Admin User Setup Script")
    print("-" * 50)
    
    # Check if email is provided as argument
    if len(sys.argv) > 1:
        email = sys.argv[1]
    else:
        # List current users
        list_users()
        
        print("\n")
        email = input("Enter the email address of the user to make admin: ").strip()
    
    if not email:
        print("❌ Email address is required.")
        return
    
    print(f"\n🚀 Setting up admin access for: {email}")
    
    if setup_admin_user(email):
        print("\n✅ Admin setup completed successfully!")
        print("   The user can now access admin endpoints.")
    else:
        print("\n❌ Admin setup failed.")

if __name__ == "__main__":
    main()