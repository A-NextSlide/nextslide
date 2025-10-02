"""
Smart Font Calculator with advanced sizing strategies and container constraints.
Handles complex layout scenarios and ensures consistent visual hierarchy.
"""

from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import math
import logging

from services.font_metrics_service import (
    FontMetricsService,
    TextBox,
    FitStrategy
)
from services.text_measurement_engine import TextMeasurementEngine

logger = logging.getLogger(__name__)


class SizingPriority(Enum):
    """Priority levels for font sizing decisions."""
    READABILITY = "readability"  # Prioritize readable size
    FIT_CONTENT = "fit_content"  # Prioritize fitting all content
    VISUAL_HIERARCHY = "visual_hierarchy"  # Maintain size relationships
    UNIFORM = "uniform"  # Keep sizes consistent across elements


@dataclass
class SizingConstraints:
    """Constraints for font sizing calculations."""
    min_size: float = 8
    max_size: float = 72
    max_lines: Optional[int] = None
    preferred_size: Optional[float] = None
    size_step: float = 1.0  # Granularity of size adjustments
    maintain_ratio: bool = False  # Maintain ratio to other elements
    force_single_line: bool = False
    allow_hyphenation: bool = False
    target_fill_ratio: float = 0.85  # Target % of container to fill


@dataclass
class ElementContext:
    """Context information about an element and its surroundings."""
    element_type: str
    hierarchy_level: int  # 1=primary, 2=secondary, 3=tertiary
    sibling_count: int
    parent_size: Optional[Tuple[float, float]] = None
    is_emphasized: bool = False
    has_background: bool = False
    adjacent_to_image: bool = False


@dataclass
class SizingResult:
    """Result of font sizing calculation."""
    font_size: float
    font_size_min: float
    font_size_max: float
    font_weight: int
    line_height: float
    letter_spacing: float
    line_clamp: Optional[int]
    estimated_lines: int
    fit_strategy: str
    confidence: float  # 0-1 confidence in the sizing
    warnings: List[str] = field(default_factory=list)


class SmartFontCalculator:
    """
    Advanced font sizing calculator with intelligent strategies.
    Ensures optimal readability and visual consistency.
    """

    # Visual hierarchy ratios (based on design principles)
    HIERARCHY_RATIOS = {
        "golden": 1.618,  # Golden ratio
        "musical": 1.5,   # Perfect fifth
        "standard": 1.414, # Square root of 2
        "minor": 1.2      # Minor third
    }

    # Element type to hierarchy mapping
    ELEMENT_HIERARCHY = {
        "title": 1,
        "heading": 2,
        "subtitle": 2,
        "body": 3,
        "bullet": 3,
        "caption": 4,
        "label": 4,
        "footnote": 5
    }

    def __init__(self):
        self.font_metrics = FontMetricsService()
        self.measurement_engine = TextMeasurementEngine()

    def calculate_optimal_size(self,
                              text: str,
                              container: TextBox,
                              font_family: str,
                              constraints: SizingConstraints,
                              context: ElementContext,
                              priority: SizingPriority = SizingPriority.VISUAL_HIERARCHY) -> SizingResult:
        """
        Calculate optimal font size considering all factors.

        Args:
            text: Text content to size
            container: Container dimensions
            font_family: Font family name
            constraints: Sizing constraints
            context: Element context information
            priority: Sizing priority strategy

        Returns:
            SizingResult with optimal settings
        """
        # Get base size for element type
        base_size = self._get_base_size(context.element_type, container, priority)

        # Apply hierarchy scaling
        if priority == SizingPriority.VISUAL_HIERARCHY:
            base_size = self._apply_hierarchy_scaling(base_size, context)

        # Calculate bounds
        min_size = max(constraints.min_size, base_size * 0.5)
        max_size = min(constraints.max_size, base_size * 2)

        # If preferred size is set, try to use it
        if constraints.preferred_size:
            target_size = constraints.preferred_size
        else:
            target_size = base_size

        # Find optimal size within bounds
        optimal_size = self._find_optimal_size(
            text=text,
            container=container,
            font_family=font_family,
            target_size=target_size,
            min_size=min_size,
            max_size=max_size,
            constraints=constraints
        )

        # Enforce absolute minimum for readability
        optimal_size = max(optimal_size, 12.0)

        # Calculate supporting metrics
        font_weight = self._get_font_weight(context)
        line_height = self._calculate_line_height(optimal_size, context)
        letter_spacing = self._calculate_letter_spacing(optimal_size, context)

        # Estimate line count
        estimated_lines = self.font_metrics.estimate_text_lines(
            text, optimal_size, font_family, container.content_width
        )

        # Determine fit strategy
        fit_strategy = self._determine_fit_strategy(
            estimated_lines, constraints, context
        )

        # Generate warnings if needed
        warnings = self._check_sizing_warnings(
            optimal_size, min_size, max_size, estimated_lines, constraints
        )

        # Calculate confidence
        confidence = self._calculate_confidence(
            optimal_size, target_size, estimated_lines, constraints
        )

        return SizingResult(
            font_size=round(optimal_size, 1),
            font_size_min=round(min_size, 1),
            font_size_max=round(max_size, 1),
            font_weight=font_weight,
            line_height=round(line_height, 2),
            letter_spacing=round(letter_spacing, 2),
            line_clamp=constraints.max_lines,
            estimated_lines=estimated_lines,
            fit_strategy=fit_strategy,
            confidence=confidence,
            warnings=warnings
        )

    def _get_base_size(self,
                      element_type: str,
                      container: TextBox,
                      priority: SizingPriority) -> float:
        """Get base font size for element type."""
        # Base sizes for 1920x1080 slides
        BASE_SIZES = {
            "title": 48,
            "heading": 36,
            "subtitle": 28,
            "body": 18,
            "bullet": 16,
            "caption": 14,
            "label": 12,
            "footnote": 10
        }

        base = BASE_SIZES.get(element_type, 16)

        # Adjust for container size - use a more generous scaling
        # Consider that typical text components are smaller than full slide
        width_ratio = container.width / 800  # Typical text component width
        height_ratio = container.height / 200  # Typical text component height

        # Use geometric mean for balanced scaling
        scale_factor = math.sqrt(width_ratio * height_ratio)

        # Apply scaling with bounds to prevent extremes
        scale_factor = max(0.5, min(2.0, scale_factor))
        base = base * scale_factor

        return base

    def _apply_hierarchy_scaling(self,
                                base_size: float,
                                context: ElementContext) -> float:
        """Apply visual hierarchy scaling to base size."""
        if context.hierarchy_level == 1:
            return base_size * 1.0
        elif context.hierarchy_level == 2:
            return base_size * 0.75
        elif context.hierarchy_level == 3:
            return base_size * 0.6
        else:
            return base_size * 0.5

    def _find_optimal_size(self,
                          text: str,
                          container: TextBox,
                          font_family: str,
                          target_size: float,
                          min_size: float,
                          max_size: float,
                          constraints: SizingConstraints) -> float:
        """Find optimal size using intelligent search."""
        # Quick check if target size works
        target_lines = self.font_metrics.estimate_text_lines(
            text, target_size, font_family, container.content_width
        )

        # Estimate required height
        metrics = self.font_metrics.get_font_metrics(font_family)
        target_height = target_lines * target_size * metrics.line_height_ratio

        # Check if target size fits - be more generous with space usage
        if (target_height <= container.content_height and
            (constraints.max_lines is None or target_lines <= constraints.max_lines)):
            return target_size

        # Binary search for optimal size
        return self.font_metrics.calculate_optimal_font_size(
            text=text,
            container=container,
            font_family=font_family,
            min_size=min_size,
            max_size=max_size,
            max_lines=constraints.max_lines,
            target_fill=constraints.target_fill_ratio
        )

    def _get_font_weight(self, context: ElementContext) -> int:
        """Get appropriate font weight for context."""
        if context.is_emphasized:
            return 700

        weight_map = {
            "title": 700,
            "heading": 600,
            "subtitle": 500,
            "body": 400,
            "bullet": 400,
            "caption": 400,
            "label": 500,
            "footnote": 300
        }

        return weight_map.get(context.element_type, 400)

    def _calculate_line_height(self,
                              font_size: float,
                              context: ElementContext) -> float:
        """Calculate appropriate line height."""
        # Tighter line height for titles, looser for body text
        if context.element_type in ["title", "heading"]:
            return 1.2
        elif context.element_type in ["body", "bullet"]:
            return 1.5
        else:
            return 1.4

    def _calculate_letter_spacing(self,
                                 font_size: float,
                                 context: ElementContext) -> float:
        """Calculate letter spacing (tracking)."""
        if context.element_type == "title" and font_size > 36:
            return -0.02  # Slight negative tracking for large titles
        elif context.element_type in ["caption", "label", "footnote"]:
            return 0.05  # Slight positive tracking for small text
        else:
            return 0

    def _determine_fit_strategy(self,
                               estimated_lines: int,
                               constraints: SizingConstraints,
                               context: ElementContext) -> str:
        """Determine the best fit strategy."""
        if constraints.force_single_line:
            return FitStrategy.TRUNCATE.value

        if constraints.max_lines and estimated_lines > constraints.max_lines:
            return FitStrategy.SHRINK_TO_FIT.value

        if context.element_type in ["title", "heading"]:
            return FitStrategy.SHRINK_TO_FIT.value

        return FitStrategy.WRAP.value

    def _check_sizing_warnings(self,
                              optimal_size: float,
                              min_size: float,
                              max_size: float,
                              estimated_lines: int,
                              constraints: SizingConstraints) -> List[str]:
        """Check for potential sizing issues."""
        warnings = []

        if optimal_size <= min_size:
            warnings.append(f"Font size at minimum ({min_size}px), text may be truncated")

        if optimal_size >= max_size:
            warnings.append(f"Font size at maximum ({max_size}px), consider reducing content")

        if optimal_size < 12:
            warnings.append("Font size below 12px may have readability issues")

        if constraints.max_lines and estimated_lines > constraints.max_lines:
            warnings.append(f"Text requires {estimated_lines} lines but limited to {constraints.max_lines}")

        return warnings

    def _calculate_confidence(self,
                            optimal_size: float,
                            target_size: float,
                            estimated_lines: int,
                            constraints: SizingConstraints) -> float:
        """Calculate confidence score for the sizing result."""
        confidence = 1.0

        # Reduce confidence if far from target
        size_diff = abs(optimal_size - target_size) / target_size
        confidence -= min(size_diff * 0.5, 0.3)

        # Reduce confidence if many lines
        if estimated_lines > 5:
            confidence -= 0.1

        # Reduce confidence if at bounds
        if optimal_size <= constraints.min_size or optimal_size >= constraints.max_size:
            confidence -= 0.2

        return max(confidence, 0.3)

    def calculate_slide_hierarchy(self,
                                 elements: List[Dict[str, Any]],
                                 theme: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Calculate font sizes for all elements maintaining visual hierarchy.

        Args:
            elements: List of text elements on the slide
            theme: Theme configuration

        Returns:
            Elements with calculated font sizes
        """
        if not elements:
            return []

        font_family = theme.get("fontFamily", "Inter")

        # Group elements by type
        element_groups = {}
        for element in elements:
            elem_type = element.get("elementType", "body")
            if elem_type not in element_groups:
                element_groups[elem_type] = []
            element_groups[elem_type].append(element)

        # Calculate sizes maintaining hierarchy
        sized_elements = []
        hierarchy_ratio = self.HIERARCHY_RATIOS["standard"]

        # Start with title/heading as anchor
        anchor_size = None
        if "title" in element_groups:
            title = element_groups["title"][0]
            title_container = self._create_container_from_bounds(title.get("bounds", {}))

            constraints = SizingConstraints(
                min_size=24,
                max_size=56,
                max_lines=2,
                target_fill_ratio=0.85
            )

            context = ElementContext(
                element_type="title",
                hierarchy_level=1,
                sibling_count=len(element_groups.get("title", [])),
                is_emphasized=True
            )

            result = self.calculate_optimal_size(
                text=title.get("content", ""),
                container=title_container,
                font_family=font_family,
                constraints=constraints,
                context=context
            )

            anchor_size = result.font_size
            title.update(self._result_to_dict(result))
            sized_elements.append(title)

        # Size other elements relative to anchor
        for elem_type, elements_list in element_groups.items():
            if elem_type == "title":
                continue

            hierarchy_level = self.ELEMENT_HIERARCHY.get(elem_type, 3)

            for element in elements_list:
                container = self._create_container_from_bounds(element.get("bounds", {}))

                # Calculate constraints based on hierarchy
                if anchor_size:
                    max_size = anchor_size / (hierarchy_ratio ** (hierarchy_level - 1))
                    min_size = max_size * 0.5
                else:
                    min_size = 12
                    max_size = 36

                constraints = SizingConstraints(
                    min_size=min_size,
                    max_size=max_size,
                    max_lines=None if elem_type == "body" else 3
                )

                context = ElementContext(
                    element_type=elem_type,
                    hierarchy_level=hierarchy_level,
                    sibling_count=len(elements_list)
                )

                result = self.calculate_optimal_size(
                    text=element.get("content", ""),
                    container=container,
                    font_family=font_family,
                    constraints=constraints,
                    context=context
                )

                element.update(self._result_to_dict(result))
                sized_elements.append(element)

        return sized_elements

    def _create_container_from_bounds(self, bounds: Dict[str, Any]) -> TextBox:
        """Create TextBox from bounds dictionary."""
        return TextBox(
            width=bounds.get("width", 600),
            height=bounds.get("height", 200),
            padding_x=bounds.get("paddingX", 20),
            padding_y=bounds.get("paddingY", 10)
        )

    def _result_to_dict(self, result: SizingResult) -> Dict[str, Any]:
        """Convert SizingResult to dictionary for component update."""
        return {
            "fontSize": result.font_size,
            "fontSizeMin": result.font_size_min,
            "fontSizeMax": result.font_size_max,
            "fontWeight": result.font_weight,
            "lineHeight": result.line_height,
            "letterSpacing": result.letter_spacing,
            "lineClamp": result.line_clamp,
            "fitStrategy": result.fit_strategy,
            "sizingConfidence": result.confidence
        }


# Singleton instance
smart_font_calculator = SmartFontCalculator()