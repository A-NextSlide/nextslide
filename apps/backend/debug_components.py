import json
import os

components_path = '/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/rag/knowledge_base/components.json'

try:
    with open(components_path, 'r') as f:
        content = f.read()
        print(f"File content start: {content[:100]}")
        
        f.seek(0)
        components = json.load(f)
        print(f"Loaded type: {type(components)}")
        
        if isinstance(components, dict):
            print(f"Keys: {list(components.keys())[:5]}")
            for k, v in components.items():
                if 'critical_rules' in v and not isinstance(v['critical_rules'], dict):
                    print(f"⚠️ {k}.critical_rules is {type(v['critical_rules'])}")
                if 'when_to_use' in v and not isinstance(v['when_to_use'], dict):
                    print(f"⚠️ {k}.when_to_use is {type(v['when_to_use'])}")
                if 'examples' in v and not isinstance(v['examples'], dict):
                    print(f"⚠️ {k}.examples is {type(v['examples'])}")
            print("Deep check complete")
        else:
            print("Not a dict!")

except Exception as e:
    print(f"Error: {e}")

