#!/usr/bin/env python3
"""
Merge extracted knowledge from prompts with existing knowledge base
Creates a comprehensive knowledge base combining all sources
"""

import json
from pathlib import Path
from typing import Dict, Any


def load_json(file_path: Path) -> Dict[str, Any]:
    """Load JSON file"""
    with open(file_path, 'r') as f:
        return json.load(f)


def deep_merge(dict1: Dict[str, Any], dict2: Dict[str, Any]) -> Dict[str, Any]:
    """Deep merge two dictionaries"""
    result = dict1.copy()
    
    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        elif key in result and isinstance(result[key], list) and isinstance(value, list):
            # Combine lists and remove duplicates
            combined = result[key] + value
            result[key] = list(dict.fromkeys(combined))  # Remove duplicates while preserving order
        else:
            result[key] = value
    
    return result


def merge_knowledge_bases():
    """Merge all knowledge sources into comprehensive KB"""
    kb_path = Path("knowledge_base")
    
    # Load existing complete KB
    complete_kb = load_json(kb_path / "complete_knowledge_base.json")
    
    # Load extracted knowledge
    extracted_kb = load_json(kb_path / "extracted_from_prompts.json")
    
    # Load icon guidelines if it exists
    icon_guidelines = {}
    icon_path = kb_path / "icon_guidelines.json"
    if icon_path.exists():
        icon_guidelines = load_json(icon_path)
    
    # Create enhanced knowledge base structure
    enhanced_kb = {
        "metadata": {
            "version": "2.0.0",
            "description": "Enhanced knowledge base with extracted prompt guidelines",
            "sources": ["build_comprehensive_kb.py", "slide_generation_prompts.py", "icon_guidelines.json"]
        }
    }
    
    # 1. Enhance typography with extracted sizing rules
    enhanced_kb["typography"] = deep_merge(
        complete_kb.get("typography", {}),
        {
            "sizing_rules": {
                "character_based": extracted_kb["text_sizing"]["character_ranges"],
                "height_calculation": extracted_kb["text_sizing"]["height_calculation"],
                "overflow_prevention": extracted_kb["text_sizing"]["overflow_prevention"],
                "custom_component_height": extracted_kb["text_sizing"]["custom_component_height"],
                "quick_formulas": extracted_kb["container_dimensions"]["quick_formulas"]
            }
        }
    )
    
    # 2. Enhance layout with extracted positioning rules
    enhanced_kb["layout"] = deep_merge(
        complete_kb.get("layout", {}),
        {
            "grid_system": {
                "snap_points": {
                    "x": extracted_kb["positioning_rules"]["x_snap_points"],
                    "y": extracted_kb["positioning_rules"]["y_snap_points"]
                }
            },
            "spacing": {
                "component_gaps": extracted_kb["positioning_rules"]["spacing"],
                "overlap_prevention_rules": extracted_kb["positioning_rules"]["overlap_prevention"],
                "edge_validation_rules": extracted_kb["positioning_rules"]["edge_validation"]
            }
        }
    )
    
    # 3. Enhance components with extracted examples and rules
    enhanced_kb["components"] = complete_kb.get("components", {})
    
    # Add shapes with text rules
    enhanced_kb["components"]["shapes_with_text"] = extracted_kb["shapes_with_text"]
    
    # Add component examples
    for comp_type, examples in extracted_kb["component_examples"].items():
        if comp_type in enhanced_kb["components"]:
            enhanced_kb["components"][comp_type]["examples"] = examples
    
    # 4. Enhance chart guidelines with extracted rules
    enhanced_kb["chart_guidelines"] = {
        "dimensions": extracted_kb["chart_guidelines"]["dimensions"],
        "positioning": extracted_kb["chart_guidelines"]["positioning"],
        "configuration": extracted_kb["chart_guidelines"]["configuration"],
        "theme_detection": extracted_kb["chart_guidelines"]["theme_detection"],
        "legend_rules": extracted_kb["chart_guidelines"]["legend_rules"],
        "tick_spacing": extracted_kb["chart_guidelines"]["tick_spacing"]
    }
    
    # 5. Enhance image guidelines with extracted layouts
    enhanced_kb["image_guidelines"] = deep_merge(
        complete_kb.get("image_guidelines", {}),
        extracted_kb["image_layouts"]
    )
    
    # 6. Add validation rules
    enhanced_kb["validation_rules"] = extracted_kb["validation_rules"]
    
    # 7. Include all other sections from complete KB
    for key in complete_kb:
        if key not in enhanced_kb and key != "metadata":
            enhanced_kb[key] = complete_kb[key]
    
    # 8. Add icon guidelines if available
    if icon_guidelines:
        enhanced_kb["icon_guidelines"] = icon_guidelines
    
    # 9. Add critical rules summary for quick access
    enhanced_kb["critical_rules_summary"] = {
        "text_sizing": "Use character-based sizing: 1-10 chars=320-480pt, 11-20=240-360pt, 21-40=180-240pt, 41-80=120-160pt, 80+=48-80pt",
        "height_calculation": "Single line: fontSize × 1.2, Multi-line: fontSize × lines × 1.3, Always add 10-20% buffer",
        "chart_positioning": "ALWAYS left (x=80) or right (x=960) half, NEVER center, 880px wide",
        "chart_legends": "ALWAYS false for bar/column/pie charts, only show for multi-series line charts",
        "overlap_prevention": "Minimum 40px gap between all components, 60px for charts/images",
        "edge_margins": "Text must be 80px from edges, charts 60px, images can be full-bleed",
        "shapes_with_text": "ALWAYS use single component (TiptapTextBlock with backgroundColor preferred)",
        "image_minimum": "Hero: 1600×900, Feature: 800×600, Cards: 400×500 minimum",
        "icon_usage": "Use content-specific icons from libraries (lucide, heroicons, feather, tabler), avoid generic Star/Circle, sizes: 24px inline, 32px bullets, 48px features, 72px hero"
    }
    
    # Save enhanced knowledge base
    output_path = kb_path / "enhanced_knowledge_base.json"
    with open(output_path, 'w') as f:
        json.dump(enhanced_kb, f, indent=2)
    
    print(f"Enhanced knowledge base saved to {output_path}")
    print(f"Total sections: {len(enhanced_kb)}")
    print(f"File size: {output_path.stat().st_size:,} bytes")
    
    # Save a version optimized for the context retriever
    save_optimized_kb(enhanced_kb, kb_path)
    
    return enhanced_kb


def save_optimized_kb(enhanced_kb: Dict[str, Any], kb_path: Path):
    """Save an optimized version for the context retriever"""
    # This will replace the complete_knowledge_base.json with the enhanced version
    optimized_path = kb_path / "complete_knowledge_base.json"
    
    # Backup the old version
    backup_path = kb_path / "complete_knowledge_base_v1.json"
    if optimized_path.exists():
        import shutil
        shutil.copy(optimized_path, backup_path)
        print(f"Backed up old KB to {backup_path}")
    
    # Save the enhanced version
    with open(optimized_path, 'w') as f:
        json.dump(enhanced_kb, f, indent=2)
    
    print(f"Updated complete_knowledge_base.json with enhanced version")


if __name__ == "__main__":
    print("Merging knowledge bases...")
    enhanced_kb = merge_knowledge_bases()
    
    # Print summary of what was enhanced
    print("\nEnhancements added:")
    print("- Character-based text sizing from prompts")
    print("- Height calculation formulas")
    print("- Positioning and overlap prevention rules")
    print("- Chart configuration and theme detection")
    print("- Shapes with text guidelines")
    print("- Component examples from prompts")
    print("- Validation rules")
    print("- Icon guidelines and usage patterns")
    print("- Critical rules summary for quick access") 