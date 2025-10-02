"""
Font Sizing Debug Utilities
Helps diagnose font sizing issues in production.
"""

import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class FontSizingDebugger:
    """Debug helper for font sizing issues."""

    @staticmethod
    def log_sizing_decision(
        component_type: str,
        text: str,
        container_size: tuple,
        calculated_size: float,
        iterations: int,
        metadata: Dict[str, Any]
    ):
        """Log detailed sizing decision for debugging."""
        log_entry = {
            "action": "FONT_SIZING",
            "component_type": component_type,
            "text_preview": text[:50] if text else "",
            "text_length": len(text) if text else 0,
            "container_width": container_size[0],
            "container_height": container_size[1],
            "calculated_size": calculated_size,
            "iterations": iterations,
            "metadata": metadata
        }

        # Use INFO level for important sizing decisions
        if calculated_size < 12 or calculated_size > 100:
            logger.warning(f"Unusual font size: {log_entry}")
        else:
            logger.info(f"Font sizing: {log_entry}")

    @staticmethod
    def analyze_slide_components(components: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze all text components on a slide for sizing issues."""
        analysis = {
            "total_components": len(components),
            "text_components": 0,
            "sizing_issues": [],
            "size_distribution": {},
            "smallest_size": float('inf'),
            "largest_size": 0,
            "components_without_sizing": []
        }

        for comp in components:
            comp_type = comp.get('type')
            props = comp.get('props', {})

            # Check if it's a text component
            if comp_type in ['TiptapTextBlock', 'TextBlock', 'Title', 'Heading']:
                analysis["text_components"] += 1

                font_size = props.get('fontSize')
                metadata = props.get('metadata', {})

                if font_size is None:
                    analysis["components_without_sizing"].append({
                        "type": comp_type,
                        "text": (props.get('text') or '')[:30]
                    })
                    continue

                # Track size distribution
                size_bucket = int(font_size / 10) * 10
                analysis["size_distribution"][size_bucket] = \
                    analysis["size_distribution"].get(size_bucket, 0) + 1

                # Track extremes
                analysis["smallest_size"] = min(analysis["smallest_size"], font_size)
                analysis["largest_size"] = max(analysis["largest_size"], font_size)

                # Check for potential issues
                if font_size < 8:
                    analysis["sizing_issues"].append({
                        "type": "TOO_SMALL",
                        "component": comp_type,
                        "size": font_size,
                        "text": (props.get('text') or '')[:30]
                    })
                elif font_size > 150:
                    analysis["sizing_issues"].append({
                        "type": "TOO_LARGE",
                        "component": comp_type,
                        "size": font_size,
                        "text": (props.get('text') or '')[:30]
                    })

                # Check if sizing was applied
                if not metadata.get('fontSizingApplied'):
                    analysis["sizing_issues"].append({
                        "type": "NO_SIZING_APPLIED",
                        "component": comp_type,
                        "size": font_size
                    })

                # Check confidence
                confidence = metadata.get('confidence', 1.0)
                if confidence < 0.5:
                    analysis["sizing_issues"].append({
                        "type": "LOW_CONFIDENCE",
                        "component": comp_type,
                        "size": font_size,
                        "confidence": confidence
                    })

        return analysis

    @staticmethod
    def generate_debug_report(components: List[Dict[str, Any]]) -> str:
        """Generate a human-readable debug report."""
        analysis = FontSizingDebugger.analyze_slide_components(components)

        report = []
        report.append("=== FONT SIZING DEBUG REPORT ===\n")
        report.append(f"Total components: {analysis['total_components']}")
        report.append(f"Text components: {analysis['text_components']}")
        report.append(f"Size range: {analysis['smallest_size']:.1f} - {analysis['largest_size']:.1f}px\n")

        if analysis['size_distribution']:
            report.append("Size Distribution:")
            for bucket in sorted(analysis['size_distribution'].keys()):
                count = analysis['size_distribution'][bucket]
                report.append(f"  {bucket}-{bucket+9}px: {count} components")
            report.append("")

        if analysis['sizing_issues']:
            report.append(f"⚠️ Found {len(analysis['sizing_issues'])} potential issues:")
            for issue in analysis['sizing_issues']:
                report.append(f"  - {issue['type']}: {issue}")
            report.append("")

        if analysis['components_without_sizing']:
            report.append(f"❌ {len(analysis['components_without_sizing'])} components without sizing:")
            for comp in analysis['components_without_sizing']:
                report.append(f"  - {comp['type']}: '{comp['text']}...'")

        return "\n".join(report)


# Helper function to enable detailed font sizing logs
def enable_font_sizing_debug():
    """Enable detailed font sizing debug logs."""
    # Set specific loggers to DEBUG level
    loggers_to_debug = [
        'services.adaptive_font_sizer',
        'services.font_metrics_service',
        'agents.generation.components.component_validator',
        'utils.font_sizing_debug'
    ]

    for logger_name in loggers_to_debug:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.DEBUG)

    print("Font sizing debug logging enabled for:")
    for name in loggers_to_debug:
        print(f"  - {name}")


# Helper function to check for common issues
def check_font_sizing_issues(slide_data: Dict[str, Any]) -> List[str]:
    """Check slide data for common font sizing issues."""
    issues = []

    components = slide_data.get('components', [])

    for comp in components:
        props = comp.get('props', {})
        font_size = props.get('fontSize')
        comp_type = comp.get('type')

        # Check for hardcoded size 16
        if font_size == 16 and comp_type in ['Title', 'Heading']:
            issues.append(f"Title/Heading has size 16 (likely hardcoded default)")

        # Check for missing adaptive sizing metadata
        metadata = props.get('metadata', {})
        if comp_type in ['TiptapTextBlock', 'TextBlock', 'Title', 'Heading']:
            if not metadata.get('adaptiveSizing'):
                issues.append(f"{comp_type} missing adaptive sizing metadata")

        # Check for size outside reasonable bounds
        if font_size:
            if font_size < 8:
                issues.append(f"{comp_type} has very small size: {font_size}px")
            elif font_size > 200:
                issues.append(f"{comp_type} has very large size: {font_size}px")

    return issues