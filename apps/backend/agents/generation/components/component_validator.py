"""
Component validator for slide generation.
"""

from typing import Dict, Any, List, Optional
import uuid
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class ComponentValidator:
    """Validates and lightly normalizes slide components."""

    def __init__(self, registry=None):
        self.registry = registry

    def validate_components(
        self,
        components: List[Dict[str, Any]],
        registry: Any = None,
        theme: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Validate components against registry with minimal normalization."""
        registry = registry or self.registry
        validated: List[Dict[str, Any]] = []

        for component in components or []:
            comp = component or {}
            if not comp.get("id"):
                comp["id"] = str(uuid.uuid4())
            if "props" not in comp or not isinstance(comp.get("props"), dict):
                comp["props"] = {}

            comp = self._clamp_component_bounds(comp)

            comp_type = comp.get("type")
            if registry and comp_type in getattr(registry, "_component_models", {}):
                try:
                    ComponentModel = registry._component_models[comp_type]
                    validated_comp = ComponentModel(**comp)
                    validated.append(validated_comp.model_dump())
                    continue
                except Exception as e:
                    message = str(e).splitlines()[0]
                    logger.debug(f"Component validation failed for {comp_type}: {message}")

            validated.append(comp)

        return validated

    def _clamp_component_bounds(self, component: Dict[str, Any]) -> Dict[str, Any]:
        props = component.get("props", {}) or {}
        pos = props.get("position")
        if isinstance(pos, dict):
            x = pos.get("x")
            y = pos.get("y")
            if isinstance(x, (int, float)):
                pos["x"] = max(0, min(1920, x))
            if isinstance(y, (int, float)):
                pos["y"] = max(0, min(1080, y))
            props["position"] = pos

        width = props.get("width")
        height = props.get("height")
        if isinstance(width, (int, float)):
            props["width"] = max(0, min(1920, width))
        if isinstance(height, (int, float)):
            props["height"] = max(0, min(1080, height))

        component["props"] = props
        return component
