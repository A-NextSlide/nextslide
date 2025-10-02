#!/usr/bin/env python3
"""Validate all imports in the project to catch issues before deployment."""

import ast
import os
import sys
from pathlib import Path

def check_imports(file_path):
    """Check if all imports in a file are valid."""
    issues = []
    
    try:
        with open(file_path, 'r') as f:
            tree = ast.parse(f.read())
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_name = alias.name
                    try:
                        __import__(module_name)
                    except ImportError as e:
                        issues.append(f"Import error in {file_path}: {module_name} - {e}")
            
            elif isinstance(node, ast.ImportFrom):
                module = node.module
                if module:
                    try:
                        __import__(module)
                    except ImportError as e:
                        issues.append(f"Import error in {file_path}: from {module} - {e}")
    
    except Exception as e:
        issues.append(f"Error parsing {file_path}: {e}")
    
    return issues

def main():
    """Check all Python files in the project."""
    project_root = Path(__file__).parent.parent
    python_files = list(project_root.rglob("*.py"))
    
    # Skip virtual environments and cache
    python_files = [
        f for f in python_files 
        if not any(p in str(f) for p in ['venv', '__pycache__', '.git', 'test_env'])
    ]
    
    all_issues = []
    
    print(f"Checking {len(python_files)} Python files...")
    
    for file_path in python_files:
        issues = check_imports(file_path)
        all_issues.extend(issues)
    
    if all_issues:
        print("\n❌ Import issues found:")
        for issue in all_issues:
            print(f"  - {issue}")
        sys.exit(1)
    else:
        print("✅ All imports are valid!")
        sys.exit(0)

if __name__ == "__main__":
    main() 