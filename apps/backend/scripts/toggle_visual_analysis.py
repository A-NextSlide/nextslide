#!/usr/bin/env python3
"""
Toggle visual analysis on/off for testing
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.config import ENABLE_VISUAL_ANALYSIS

def toggle_visual_analysis():
    """Toggle the visual analysis setting"""
    env_file = Path(".env")
    
    # Read current .env file
    lines = []
    if env_file.exists():
        with open(env_file, 'r') as f:
            lines = f.readlines()
    
    # Check current state
    current_state = ENABLE_VISUAL_ANALYSIS
    new_state = not current_state
    
    # Update or add the setting
    found = False
    for i, line in enumerate(lines):
        if line.strip().startswith("ENABLE_VISUAL_ANALYSIS="):
            lines[i] = f"ENABLE_VISUAL_ANALYSIS={'true' if new_state else 'false'}\n"
            found = True
            break
    
    if not found:
        lines.append(f"\n# Visual analysis setting\n")
        lines.append(f"ENABLE_VISUAL_ANALYSIS={'true' if new_state else 'false'}\n")
    
    # Write back
    with open(env_file, 'w') as f:
        f.writelines(lines)
    
    print(f"Visual Analysis: {'OFF' if current_state else 'ON'} → {'ON' if new_state else 'OFF'}")
    print(f"Updated .env file")
    print(f"\nNOTE: Restart the server for changes to take effect!")

if __name__ == "__main__":
    toggle_visual_analysis() 