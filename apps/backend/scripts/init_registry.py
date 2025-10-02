#!/usr/bin/env python3
"""
Initialize the backend registry from saved schemas.
This prevents needing to reload the browser every time.
"""

import requests
import json
import os
import sys
import time

def load_saved_schemas():
    """Load schemas from the saved file"""
    schemas_path = os.path.join(os.path.dirname(__file__), '../schemas/typebox_schemas_latest.json')
    
    if not os.path.exists(schemas_path):
        print(f"❌ No saved schemas found at {schemas_path}")
        print("   You need to load the frontend at least once to generate schemas.")
        return None
    
    try:
        with open(schemas_path, 'r') as f:
            schemas = json.load(f)
        print(f"✅ Loaded {len(schemas)} schemas from file")
        return schemas
    except Exception as e:
        print(f"❌ Error loading schemas: {e}")
        return None

def send_registry_to_backend(schemas, backend_url="http://localhost:9090"):
    """Send the registry data to the backend"""
    try:
        # Check if backend is ready
        health_url = f"{backend_url}/api/health"
        response = requests.get(health_url, timeout=5)
        
        if response.status_code != 200:
            print(f"❌ Backend not ready (status {response.status_code})")
            return False
        
        health_data = response.json()
        if health_data.get("registry_loaded"):
            print("✅ Registry already loaded in backend")
            return True
        
        # Send registry
        registry_url = f"{backend_url}/api/registry"
        registry_data = {
            "source": "init_script",
            "schemas": schemas
        }
        
        print("📤 Sending registry to backend...")
        response = requests.post(registry_url, json=registry_data, timeout=10)
        
        if response.status_code == 200:
            print("✅ Registry successfully sent to backend!")
            return True
        else:
            print(f"❌ Failed to send registry (status {response.status_code})")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend. Is it running?")
        return False
    except Exception as e:
        print(f"❌ Error sending registry: {e}")
        return False

def main():
    """Main function"""
    print("🔄 Initializing backend registry...\n")
    
    # Load schemas
    schemas = load_saved_schemas()
    if not schemas:
        sys.exit(1)
    
    # Send to backend
    success = send_registry_to_backend(schemas)
    
    if success:
        print("\n✨ Registry initialization complete!")
    else:
        print("\n❌ Registry initialization failed")
        sys.exit(1)

if __name__ == "__main__":
    main() 