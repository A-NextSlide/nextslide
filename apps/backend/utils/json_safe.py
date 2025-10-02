#!/usr/bin/env python3
"""
JSON-safe serialization utilities for real-time WebSocket events.
Ensures all Pydantic models and complex objects are properly converted to plain dicts.
"""
import json
from typing import Any, Dict, List
from datetime import datetime, date
from decimal import Decimal
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

def to_json_safe(obj: Any) -> Any:
    """
    Convert any object to a JSON-serializable representation.
    Handles Pydantic models, ComponentBase objects, datetime, etc.
    
    Args:
        obj: Any object that needs to be JSON-serializable
        
    Returns:
        JSON-safe representation of the object
    """
    try:
        # Debug logging for DeckDiffBase objects
        if hasattr(obj, '__class__') and 'DeckDiff' in str(obj.__class__):
            logger.info(f"[to_json_safe] Processing DeckDiffBase: {obj}")
            logger.info(f"[to_json_safe] DeckDiffBase type: {type(obj)}")
            logger.info(f"[to_json_safe] DeckDiffBase has model_dump: {hasattr(obj, 'model_dump')}")
            logger.info(f"[to_json_safe] DeckDiffBase has dict: {hasattr(obj, 'dict')}")
        # Handle None
        if obj is None:
            return None
            
        # Handle basic JSON-safe types
        if isinstance(obj, (str, int, float, bool)):
            return obj
            
        # Handle datetime objects
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
            
        # Handle Decimal
        if isinstance(obj, Decimal):
            return float(obj)
            
        # Handle Pydantic models (try model_dump first, then dict)
        if hasattr(obj, 'model_dump'):
            try:
                # For diff-like models, DO NOT exclude unset so mutated defaults (like appended lists)
                # are preserved. Also keep explicit None values to allow clearing fields.
                cls_name = getattr(obj.__class__, '__name__', '')
                if any(k in cls_name for k in ("DeckDiff", "SlideDiff", "ComponentDiff")):
                    result = to_json_safe(obj.model_dump(exclude_none=False, exclude_unset=False))
                else:
                    result = to_json_safe(obj.model_dump(exclude_none=True, exclude_unset=True))
                logger.debug(f"Successfully serialized {type(obj)} via model_dump")
                return result
            except Exception as e:
                logger.warning(f"model_dump failed for {type(obj)}: {e}")
        if hasattr(obj, 'dict'):
            try:
                # Same handling as above for dict() path
                cls_name = getattr(obj.__class__, '__name__', '')
                if any(k in cls_name for k in ("DeckDiff", "SlideDiff", "ComponentDiff")):
                    result = to_json_safe(obj.dict(exclude_none=False, exclude_unset=False))
                else:
                    result = to_json_safe(obj.dict(exclude_none=True, exclude_unset=True))
                logger.debug(f"Successfully serialized {type(obj)} via dict")
                return result
            except Exception as e:
                logger.warning(f"dict() failed for {type(obj)}: {e}")
                
        # Handle dictionaries
        if isinstance(obj, dict):
            result = {}
            for key, value in obj.items():
                # Ensure keys are strings
                safe_key = str(key) if not isinstance(key, str) else key
                result[safe_key] = to_json_safe(value)
            return result
            
        # Handle lists and tuples
        if isinstance(obj, (list, tuple)):
            return [to_json_safe(item) for item in obj]
            
        # Handle sets
        if isinstance(obj, set):
            return [to_json_safe(item) for item in obj]
            
        # Handle objects with __dict__
        if hasattr(obj, '__dict__'):
            return to_json_safe(obj.__dict__)
            
        # For everything else, try to convert to string
        logger.warning(f"Falling back to str() for object {type(obj)}: {obj}")
        return str(obj)
        
    except Exception as e:
        logger.error(f"Failed to serialize object {type(obj)}: {e}")
        import traceback
        logger.error(f"Serialization traceback: {traceback.format_exc()}")
        return str(obj)

def ensure_json_serializable(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure an entire event payload is JSON-serializable.
    
    Args:
        data: Event data dictionary
        
    Returns:
        JSON-safe event data
    """
    try:
        # First, convert all data to JSON-safe format
        safe_data = to_json_safe(data)
        
        # Verify it can actually be JSON serialized
        json.dumps(safe_data)
        
        return safe_data
        
    except Exception as e:
        logger.error(f"Failed to make event data JSON-safe: {e}")
        # Return a minimal safe payload
        return {
            "error": "serialization_failed",
            "original_type": str(type(data)),
            "message": str(e)
        }

def test_json_safe():
    """Test the JSON-safe utilities with various object types."""
    from pydantic import BaseModel
    
    class TestModel(BaseModel):
        id: str
        name: str
        value: int
        
    # Test objects
    test_cases = [
        None,
        "string",
        123,
        123.45,
        True,
        datetime.now(),
        {"key": "value"},
        [1, 2, 3],
        TestModel(id="test", name="Test Model", value=42),
        {"nested": {"model": TestModel(id="nested", name="Nested", value=100)}}
    ]
    
    for i, test_case in enumerate(test_cases):
        try:
            result = to_json_safe(test_case)
            # Verify it's actually JSON serializable
            json.dumps(result)
            print(f"✅ Test case {i}: {type(test_case)} -> JSON-safe")
        except Exception as e:
            print(f"❌ Test case {i}: {type(test_case)} -> Failed: {e}")

if __name__ == "__main__":
    test_json_safe()