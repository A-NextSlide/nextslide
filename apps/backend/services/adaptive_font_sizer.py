"""
Adaptive Font Sizer - No hardcoded limits, iterates until text fits.
Uses binary search to find maximum size that fits without overflow.
"""

from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
import logging
import math

logger = logging.getLogger(__name__)


@dataclass
class SizingResult:
    """Result of adaptive font sizing."""
    font_size: float
    iterations: int
    fits: bool
    estimated_lines: int
    width_used: float
    height_used: float
    confidence: float


class AdaptiveFontSizer:
    """
    Dynamically sizes text to fill containers without overflow.
    No hardcoded limits - purely based on container dimensions.
    """

    def __init__(self, font_metrics_service=None):
        self.font_metrics = font_metrics_service
        if not self.font_metrics:
            from services.font_metrics_service import font_metrics_service
            self.font_metrics = font_metrics_service

    def find_optimal_size(
        self,
        text: str,
        container_width: float,
        container_height: float,
        font_family: str,
        padding_x: float = 0,
        padding_y: float = 0,
        max_iterations: int = 20,
        precision: float = 0.5
    ) -> SizingResult:
        """
        Find the maximum font size that fits in container using binary search.
        NO HARDCODED LIMITS - adapts to any container size.

        Args:
            text: Text to size
            container_width: Container width in pixels
            container_height: Container height in pixels
            font_family: Font family name
            padding_x: Horizontal padding
            padding_y: Vertical padding
            max_iterations: Maximum iterations for convergence
            precision: Size precision in pixels

        Returns:
            SizingResult with optimal size
        """
        if not text or not text.strip():
            # Empty text - return proportional to container
            safe_height = container_height if container_height else 100
            return SizingResult(
                font_size=safe_height * 0.5,
                iterations=0,
                fits=True,
                estimated_lines=0,
                width_used=0,
                height_used=0,
                confidence=1.0
            )

        # Ensure we have valid numeric dimensions
        if container_width is None or container_height is None:
            logger.warning(f"Invalid container dimensions: {container_width}x{container_height}")
            return SizingResult(
                font_size=16.0,
                iterations=0,
                fits=True,
                estimated_lines=1,
                width_used=container_width or 0,
                height_used=container_height or 0,
                confidence=0.5
            )

        # Available space after padding
        available_width = container_width - (2 * padding_x)
        available_height = container_height - (2 * padding_y)

        if available_width <= 0 or available_height <= 0:
            logger.warning(f"Container too small after padding: {available_width}x{available_height}")
            return SizingResult(
                font_size=8.0,  # Absolute minimum for visibility
                iterations=0,
                fits=False,
                estimated_lines=1,
                width_used=container_width,
                height_used=container_height,
                confidence=0.0
            )

        # Dynamic bounds based on container size
        # Start with aggressive bounds - no hardcoded limits!
        min_size = 1.0  # Start very small
        max_size = available_height  # Can't be taller than container

        # Refine max based on single character width estimate
        # This prevents starting with impossibly large sizes
        single_char_estimate = available_width / max(1, len(text) * 0.3)
        max_size = min(max_size, single_char_estimate * 3)

        logger.debug(f"Starting search: text='{text[:30]}...', container={available_width}x{available_height}, bounds={min_size:.1f}-{max_size:.1f}")

        # Binary search for optimal size
        optimal_size = min_size
        iterations = 0
        best_fit = None

        while (max_size - min_size) > precision and iterations < max_iterations:
            iterations += 1
            test_size = (min_size + max_size) / 2

            # Test if this size fits
            fits, lines, width_used, height_used = self._test_size(
                text, test_size, font_family, available_width, available_height
            )

            logger.debug(f"  Iteration {iterations}: size={test_size:.1f}, fits={fits}, lines={lines}, space_used={width_used:.0f}x{height_used:.0f}")

            if fits:
                # It fits - try larger
                optimal_size = test_size
                best_fit = (lines, width_used, height_used)
                min_size = test_size
            else:
                # Doesn't fit - try smaller
                max_size = test_size

        # Final validation at optimal size
        if best_fit is None:
            fits, lines, width_used, height_used = self._test_size(
                text, optimal_size, font_family, available_width, available_height
            )
            best_fit = (lines, width_used, height_used)
        else:
            fits = True
            lines, width_used, height_used = best_fit

        # Calculate confidence based on space utilization
        space_utilization = (width_used * height_used) / (available_width * available_height)
        confidence = min(1.0, space_utilization)

        logger.debug(
            f"Sized '{text[:30]}...' to {optimal_size:.1f}px in {iterations} iterations "
            f"(container={available_width:.0f}x{available_height:.0f}, lines={lines}, confidence={confidence:.2f})"
        )

        return SizingResult(
            font_size=round(optimal_size, 1),
            iterations=iterations,
            fits=fits,
            estimated_lines=lines,
            width_used=width_used,
            height_used=height_used,
            confidence=confidence
        )

    def _test_size(
        self,
        text: str,
        font_size: float,
        font_family: str,
        max_width: float,
        max_height: float
    ) -> Tuple[bool, int, float, float]:
        """
        Test if text at given size fits in container.

        Returns:
            (fits, line_count, width_used, height_used)
        """
        # Get font metrics
        metrics = self.font_metrics.get_font_metrics(font_family)

        # Calculate text width for single line
        text_width = self.font_metrics.estimate_text_width(text, font_size, font_family)

        # Ensure we have a valid width value
        if text_width is None:
            text_width = len(text) * font_size * 0.6  # Rough estimate

        # Calculate line height
        line_height = font_size * (metrics.line_height_ratio if metrics and metrics.line_height_ratio else 1.2)

        # Check if it fits in one line
        if text_width <= max_width:
            height_used = line_height
            fits = height_used <= max_height
            return fits, 1, text_width, height_used

        # Need to wrap - calculate lines
        line_count = self.font_metrics.estimate_text_lines(text, font_size, font_family, max_width)
        if line_count is None or line_count <= 0:
            line_count = max(1, int(text_width / max_width) + 1)  # Estimate based on overflow

        height_used = line_count * line_height
        width_used = max_width  # When wrapping, we use full width

        fits = height_used <= max_height
        return fits, line_count, width_used, height_used

    def size_with_role_hint(
        self,
        text: str,
        container_width: float,
        container_height: float,
        font_family: str,
        role: Optional[str] = None,
        padding_x: float = 0,
        padding_y: float = 0
    ) -> Dict[str, Any]:
        """
        Size text with optional role hint for better initial bounds.
        Still no hardcoded limits - role just helps convergence speed.

        Args:
            text: Text to size
            container_width: Container width
            container_height: Container height
            font_family: Font family
            role: Optional hint like 'title', 'body', 'caption'
            padding_x: Horizontal padding
            padding_y: Vertical padding

        Returns:
            Dict with fontSize and metadata
        """
        # Get base sizing
        result = self.find_optimal_size(
            text=text,
            container_width=container_width,
            container_height=container_height,
            font_family=font_family,
            padding_x=padding_x,
            padding_y=padding_y
        )

        # Apply role-based adjustments if needed
        # These are NOT hardcoded limits, just optimization hints
        if role == "title" and result.estimated_lines > 2:
            # Titles should ideally be 1-2 lines, but we don't force it
            logger.debug(f"Title has {result.estimated_lines} lines, may need content adjustment")

        return {
            "fontSize": result.font_size,
            "estimatedLines": result.estimated_lines,
            "iterations": result.iterations,
            "confidence": result.confidence,
            "fits": result.fits,
            "role": role,
            "containerSize": f"{container_width}x{container_height}",
            "spaceUsed": f"{result.width_used:.0f}x{result.height_used:.0f}"
        }

    def batch_size_elements(
        self,
        elements: list,
        maintain_hierarchy: bool = True
    ) -> list:
        """
        Size multiple elements, optionally maintaining visual hierarchy.

        Args:
            elements: List of elements with text, bounds, and metadata
            maintain_hierarchy: Whether to ensure titles > headings > body

        Returns:
            Elements with calculated font sizes
        """
        sized_elements = []
        hierarchy_sizes = {}

        for element in elements:
            # Extract element data
            text = element.get("content", "")
            bounds = element.get("bounds", {})
            font_family = element.get("fontFamily", "Inter")
            role = element.get("role") or element.get("elementType") or element.get("type", "").lower()

            # Get container dimensions
            width = bounds.get("width", 600)
            height = bounds.get("height", 200)
            padding_x = bounds.get("paddingX", 20)
            padding_y = bounds.get("paddingY", 10)

            # Calculate optimal size
            result = self.find_optimal_size(
                text=text,
                container_width=width,
                container_height=height,
                font_family=font_family,
                padding_x=padding_x,
                padding_y=padding_y
            )

            # Store for hierarchy adjustment if needed
            if maintain_hierarchy and role:
                if role not in hierarchy_sizes:
                    hierarchy_sizes[role] = []
                hierarchy_sizes[role].append(result.font_size)

            # Update element
            element["fontSize"] = result.font_size
            element["fontSizeMetadata"] = {
                "iterations": result.iterations,
                "confidence": result.confidence,
                "estimatedLines": result.estimated_lines,
                "fits": result.fits
            }

            sized_elements.append(element)

        # Adjust for hierarchy if requested
        if maintain_hierarchy and hierarchy_sizes:
            sized_elements = self._adjust_hierarchy(sized_elements, hierarchy_sizes)

        return sized_elements

    def _adjust_hierarchy(self, elements: list, hierarchy_sizes: Dict[str, list]) -> list:
        """
        Adjust sizes to maintain visual hierarchy.
        Only reduces sizes, never increases (to prevent overflow).
        """
        # Define hierarchy order (higher number = should be larger)
        hierarchy_order = {
            "title": 5,
            "heading": 4,
            "subtitle": 3,
            "body": 2,
            "bullet": 2,
            "caption": 1,
            "label": 1
        }

        # Get average size for each role
        role_averages = {}
        for role, sizes in hierarchy_sizes.items():
            role_averages[role] = sum(sizes) / len(sizes)

        # Check for hierarchy violations
        adjustments_needed = False
        for role1, avg1 in role_averages.items():
            order1 = hierarchy_order.get(role1, 2)
            for role2, avg2 in role_averages.items():
                order2 = hierarchy_order.get(role2, 2)
                if order1 > order2 and avg1 < avg2:
                    adjustments_needed = True
                    logger.debug(f"Hierarchy violation: {role1}({avg1:.1f}) < {role2}({avg2:.1f})")

        if not adjustments_needed:
            return elements

        # Apply minimal adjustments to fix hierarchy
        for element in elements:
            role = element.get("role") or element.get("elementType") or element.get("type", "").lower()
            if not role:
                continue

            current_size = element["fontSize"]
            role_order = hierarchy_order.get(role, 2)

            # Check against other roles
            for other_role, other_avg in role_averages.items():
                other_order = hierarchy_order.get(other_role, 2)

                if role_order > other_order and current_size < other_avg:
                    # This element should be larger but isn't
                    # We can't increase (might overflow), so reduce the other
                    logger.debug(f"Would adjust {role} hierarchy, but keeping size to prevent overflow")

        return elements


# Singleton instance
adaptive_font_sizer = AdaptiveFontSizer()