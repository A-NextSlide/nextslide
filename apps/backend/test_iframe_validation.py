
import sys
import os
import logging

# Add the current directory to sys.path to import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agents.generation.components.component_validator import ComponentValidator

# Configure logging
logging.basicConfig(level=logging.DEBUG)

def test_iframe_validation():
    validator = ComponentValidator()
    
    # Test case: CustomComponent with full HTML render (Iframe Mode)
    # It contains 'document.' which was previously prohibited
    iframe_component = {
        "type": "CustomComponent",
        "props": {
            "width": 800,
            "height": 600,
            "render": "<!DOCTYPE html><html><body><script>document.body.innerHTML = '<h1>Hello Iframe</h1>';</script></body></html>"
        }
    }
    
    print("Validating Iframe Component...")
    validated = validator.validate_components([iframe_component])
    
    result_render = validated[0]['props']['render']
    print(f"Result Render: {result_render}")
    
    # Check if the render string is preserved (starts with <!DOCTYPE html>)
    # and NOT replaced by the default function (which starts with "function render")
    if result_render.strip().lower().startswith("<!doctype html"):
        print("SUCCESS: Iframe component preserved!")
    else:
        print("FAILURE: Iframe component was replaced or modified incorrectly.")
        if "function render" in result_render:
            print("It was replaced by the default render function.")

if __name__ == "__main__":
    test_iframe_validation()
