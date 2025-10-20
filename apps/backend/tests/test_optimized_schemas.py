"""
Test optimized component schemas integration
"""

def test_optimized_schemas_import():
    """Test that optimized schemas can be imported and used"""
    from agents.prompts.generation.optimized_component_schemas import (
        get_optimized_component_schemas,
        get_customcomponent_emphasis
    )
    
    # Get the schemas
    schemas = get_optimized_component_schemas()
    emphasis = get_customcomponent_emphasis()
    
    # Verify they're strings and not empty
    assert isinstance(schemas, str), "Schemas should be a string"
    assert len(schemas) > 100, "Schemas should have substantial content"
    assert isinstance(emphasis, str), "Emphasis should be a string"
    assert len(emphasis) > 50, "Emphasis should have content"
    
    # Verify key sections exist
    assert "CustomComponent" in schemas, "Should mention CustomComponent"
    assert "Icon" in schemas, "Should mention Icon"
    assert "TiptapTextBlock" in schemas, "Should mention TiptapTextBlock"
    assert "Background" in schemas, "Should mention Background"
    
    # Verify CustomComponent is emphasized
    assert "USE CUSTOMCOMPONENT FOR" in schemas, "Should emphasize CustomComponent usage"
    assert "getContrastTextColor" in schemas, "Should mention color utilities"
    
    # Verify Icon guidance
    assert "USE SPARINGLY" in schemas or "sparingly" in schemas.lower(), "Should warn about icon overuse"
    assert "lucide" in schemas.lower(), "Should mention Lucide library"
    
    print("✅ Optimized schemas test passed!")
    print(f"   - Schema length: {len(schemas)} chars")
    print(f"   - Emphasis length: {len(emphasis)} chars")
    return True


def test_html_inspired_integration():
    """Test that HTML-inspired system prompt uses optimized schemas"""
    from agents.prompts.generation.html_inspired_system_prompt_v2 import (
        get_condensed_component_schemas
    )
    
    # Get the condensed schemas (should use optimized version)
    schemas = get_condensed_component_schemas()
    
    # Verify it's using the optimized version
    assert isinstance(schemas, str), "Should return a string"
    assert len(schemas) > 100, "Should have content"
    assert "CustomComponent" in schemas, "Should include CustomComponent"
    
    # Check for optimization markers
    assert "USE CUSTOMCOMPONENT" in schemas or "CustomComponent" in schemas, "Should emphasize CustomComponent"
    
    print("✅ HTML-inspired integration test passed!")
    print(f"   - Schema length: {len(schemas)} chars")
    return True


def test_elite_components_templates():
    """Test that elite components library has new templates"""
    from services.elite_components import ELITE_COMPONENTS
    
    # Verify new templates exist
    required_templates = [
        "StatDashboard",
        "SimpleStatCard",
        "IconText",
        "FeatureCard",
        "ProgressBar"
    ]
    
    for template in required_templates:
        assert template in ELITE_COMPONENTS, f"Missing template: {template}"
        assert "code" in ELITE_COMPONENTS[template], f"Template {template} missing code"
        assert "defaultProps" in ELITE_COMPONENTS[template], f"Template {template} missing defaultProps"
    
    print("✅ Elite components templates test passed!")
    print(f"   - Total templates: {len(ELITE_COMPONENTS)}")
    print(f"   - New templates: {', '.join(required_templates)}")
    return True


def test_schema_size_reduction():
    """Verify schema size is optimized (not too verbose)"""
    from agents.prompts.generation.optimized_component_schemas import (
        get_optimized_component_schemas
    )
    
    schemas = get_optimized_component_schemas()
    
    # Optimized schemas should be reasonable size
    # (Old verbose schemas were ~8000+ chars, optimized should be ~3000-4000)
    assert len(schemas) < 6000, f"Schemas too verbose: {len(schemas)} chars (should be < 6000)"
    assert len(schemas) > 2000, f"Schemas too short: {len(schemas)} chars (should be > 2000)"
    
    # Count component mentions
    component_count = schemas.count("**") // 2  # Each component starts with **
    assert component_count >= 5, "Should have at least 5 core components"
    assert component_count <= 12, "Should not have too many components (keep it focused)"
    
    print("✅ Schema size optimization test passed!")
    print(f"   - Schema length: {len(schemas)} chars (target: 2000-6000)")
    print(f"   - Component count: {component_count}")
    return True


if __name__ == "__main__":
    print("\n🧪 Running Optimized Component Schema Tests...\n")
    
    try:
        test_optimized_schemas_import()
        print()
        test_html_inspired_integration()
        print()
        test_elite_components_templates()
        print()
        test_schema_size_reduction()
        print()
        print("✅ All tests passed!")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
    except Exception as e:
        print(f"\n❌ Error running tests: {e}")
        import traceback
        traceback.print_exc()

