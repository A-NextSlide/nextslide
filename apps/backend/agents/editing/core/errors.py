"""
Standardized error handling for the editing system.

All tools should raise these errors instead of generic exceptions.
"""

from typing import Optional, Dict, Any


class EditorError(Exception):
    """Base error for all editing operations."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "details": self.details
        }


class ComponentNotFoundError(EditorError):
    """Raised when a component ID is not found in the deck."""

    def __init__(self, component_id: str, slide_id: Optional[str] = None):
        details = {"component_id": component_id}
        if slide_id:
            details["slide_id"] = slide_id
        super().__init__(f"Component '{component_id}' not found", details)


class SlideNotFoundError(EditorError):
    """Raised when a slide ID is not found in the deck."""

    def __init__(self, slide_id: str):
        super().__init__(f"Slide '{slide_id}' not found", {"slide_id": slide_id})


class InvalidComponentTypeError(EditorError):
    """Raised when an invalid component type is specified."""

    def __init__(self, component_type: str, valid_types: list):
        super().__init__(
            f"Invalid component type '{component_type}'",
            {"component_type": component_type, "valid_types": valid_types}
        )


class ToolExecutionError(EditorError):
    """Raised when a tool fails to execute."""

    def __init__(self, tool_name: str, reason: str, original_error: Optional[Exception] = None):
        details = {"tool_name": tool_name, "reason": reason}
        if original_error:
            details["original_error"] = str(original_error)
        super().__init__(f"Tool '{tool_name}' failed: {reason}", details)


class CustomComponentError(EditorError):
    """Raised for CustomComponent-specific errors."""

    def __init__(self, message: str, component_id: Optional[str] = None):
        details = {}
        if component_id:
            details["component_id"] = component_id
        super().__init__(message, details)


class StrReplaceError(CustomComponentError):
    """Raised when str_replace cannot find the target string."""

    def __init__(self, old_string: str, component_id: str, suggestion: Optional[str] = None):
        details = {
            "component_id": component_id,
            "old_string": old_string[:100] + "..." if len(old_string) > 100 else old_string
        }
        if suggestion:
            details["suggestion"] = suggestion

        message = f"Could not find string to replace in component '{component_id}'"
        if suggestion:
            message += f". {suggestion}"

        super().__init__(message, component_id)
        self.details = details
