"""Chart generation for slides"""

import json
import logging
from typing import List, Dict, Any, Optional, Tuple

from agents.ai.clients import get_client, invoke, get_max_tokens_for_model
from .models import ChartData

logger = logging.getLogger(__name__)


class ChartGenerator:
    """Handles chart type selection and data generation"""
    
    def __init__(self, registry=None):
        self.registry = registry
        self._chart_types_cache = None
        self._chart_descriptions_cache = None
        self.chart_types = self._get_chart_types_from_registry() if registry else [
            "pie", "line", "bar", "column", "scatter", "area", 
            "donut", "spline", "waterfall", "radar", "gauge", "treemap",
            "sankey", "boxplot", "histogram", "sunburst", "bubble"
        ]
        
    def _get_chart_types_from_registry(self) -> List[str]:
        """Extract chart types from the registry"""
        if self._chart_types_cache is not None:
            return self._chart_types_cache
            
        if self.registry is None:
            self._chart_types_cache = ["pie", "line", "bar", "scatter"]
            return self._chart_types_cache
            
        try:
            chart_schema = self.registry.get_json_schemas().get("Chart", {})
            chart_type_property = chart_schema.get("schema", {}).get("properties", {}).get("chartType", {})
            
            if "anyOf" in chart_type_property:
                chart_types = [item["const"] for item in chart_type_property["anyOf"] if "const" in item]
                self._chart_types_cache = chart_types
                return chart_types
            elif "enumValues" in chart_type_property.get("metadata", {}).get("controlProps", {}):
                chart_types = chart_type_property["metadata"]["controlProps"]["enumValues"]
                self._chart_types_cache = chart_types
                return chart_types
        except Exception as e:
            logger.warning(f"Failed to extract chart types from registry: {e}")
        
        self._chart_types_cache = ["pie", "line", "bar", "scatter"]
        return self._chart_types_cache
    
    def get_chart_type_descriptions(self) -> str:
        """Generate comprehensive chart type descriptions for AI prompts"""
        if self._chart_descriptions_cache is not None:
            return self._chart_descriptions_cache
            
        chart_types = self._get_chart_types_from_registry()
        
        descriptions = {
            "bar": "BAR: Compare numerical values across categories (horizontal bars)",
            "column": "COLUMN: Compare numerical values across categories (vertical bars)", 
            "pie": "PIE: Show numerical percentages/distributions that total 100%",
            "line": "LINE: Show numerical trends over time, continuous data series",
            "area": "AREA: Show cumulative numerical totals over time, filled area",
            "spline": "SPLINE: Smooth curved line for numerical trends, elegant time series",
            "areaspline": "AREASPLINE: Smooth curved area for numerical data over time",
            "streamgraph": "STREAMGRAPH: Multiple numerical layers flowing over time",
            "scatter": "SCATTER: Show correlation between two numerical variables",
            "bubble": "BUBBLE: Three-dimensional numerical data (x, y, size)",
            "packedbubble": "PACKEDBUBBLE: Grouped numerical values as packed circles",
            "boxplot": "BOXPLOT: Statistical distribution of numerical data, quartiles",
            "errorbar": "ERRORBAR: Numerical data with uncertainty ranges",
            "gauge": "GAUGE: Single numerical metric as progress meter",
            "waterfall": "WATERFALL: Sequential numerical changes showing cumulative effect",
            "sankey": "SANKEY: Quantitative flows with numerical values (e.g., traffic with visitor counts)",
            "pyramid": "PYRAMID: Numerical hierarchical data, population demographics",
            "treemap": "TREEMAP: Numerical hierarchical data as proportional rectangles (market cap, file sizes)",
            "sunburst": "SUNBURST: Multi-level numerical hierarchical data, radial visualization (budget breakdowns)",
            "networkgraph": "NETWORKGRAPH: Weighted relationships with numerical connections",
            "dependencywheel": "DEPENDENCYWHEEL: Circular network with numerical flow values",
            "radar": "RADAR: Multi-dimensional numerical comparison, spider chart (feature scores)",
            "heatmap": "HEATMAP: Two-dimensional numerical intensity, color-coded matrix"
        }
        
        available_descriptions = []
        for chart_type in chart_types:
            if chart_type in descriptions:
                available_descriptions.append(f"   - {descriptions[chart_type]}")
            else:
                available_descriptions.append(f"   - {chart_type.upper()}: Specialized visualization type")
        
        self._chart_descriptions_cache = "\n".join(available_descriptions)
        return self._chart_descriptions_cache
    
    async def determine_optimal_chart_type_and_data(
        self, 
        slide_title: str, 
        content: str, 
        existing_data: Optional[List] = None,
        model_name: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Determine the best chart type and generate appropriate data"""
        
        # IMPORTANT: Check if we have AI-generated data first!
        if existing_data and len(existing_data) > 0:
            logger.info(f"[CHART] Using AI-generated data with {len(existing_data)} points")
            
            # Convert ChartDataPoint objects to dict format
            converted_data = []
            for item in existing_data:
                if hasattr(item, 'name') and hasattr(item, 'value'):
                    # Standard format
                    converted_data.append({
                        "name": item.name,
                        "value": float(item.value)
                    })
                elif hasattr(item, 'x') and hasattr(item, 'y'):
                    # Line chart format - convert to name/value
                    converted_data.append({
                        "name": str(item.x),
                        "value": float(item.y)
                    })
                elif isinstance(item, dict):
                    # Already a dict
                    converted_data.append(item)
            
            if converted_data:
                # CRITICAL: Validate unit consistency before creating chart
                if not self._validate_unit_consistency(converted_data):
                    logger.warning(f"[CHART] Mixed units detected in AI-generated data for slide '{slide_title}' - rejecting chart")
                    return "", []
                    
                # Determine chart type based on data and context
                chart_type = self._determine_chart_type_from_data(converted_data, slide_title, content, context)
                logger.info(f"[CHART] Selected {chart_type} chart for AI-generated data")
                return chart_type, converted_data
        
        # If no AI data provided, don't generate fake data
        logger.warning(f"[CHART] No AI-generated data provided for slide '{slide_title}'. Charts require real data from the model.")
        
        # Return empty data to indicate no chart should be created
        return "", []
    
    def _determine_chart_type_from_data(
        self, data: List[Dict[str, Any]], title: str, content: str, context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Lightweight fallback for chart type selection
        
        IMPORTANT: The AI model should specify chart_type in the response.
        This is only a simple fallback when the AI doesn't provide one.
        We keep it minimal to avoid overriding the AI's intelligent choices.
        """
        
        # Get available chart types and previously used ones
        available_types = self._get_chart_types_from_registry()
        used_charts = []
        if context and context.get('used_charts'):
            used_charts = [chart['type'] for chart in context['used_charts']]
        
        # Minimal fallback: prefer common types, avoid keyword heuristics.
        preferred = ['column', 'bar', 'line', 'area', 'pie']
        for chart_type in preferred:
            if chart_type in available_types and used_charts.count(chart_type) < 2:
                return chart_type

        return available_types[0] if available_types else 'column'
    
    async def generate_chart_title(
        self, 
        slide_title: str, 
        chart_type: str, 
        data: List[Dict[str, Any]], 
        presentation_title: str
    ) -> str:
        """Generate an appropriate title for the chart with units"""
        
        # Try to extract a meaningful title from the slide title
        # Remove common prefixes
        prefixes_to_remove = ['the', 'our', 'your', 'this', 'these', 'a', 'an']
        title_words = slide_title.split()
        if title_words and title_words[0].lower() in prefixes_to_remove:
            title_words = title_words[1:]
        
        cleaned_title = ' '.join(title_words)
        
        # Detect units from data labels or values
        unit = self._detect_unit_from_data(data, "")
        unit_suffix = f" ({unit})" if unit else ""
        
        _ = chart_type
        return f"{cleaned_title}{unit_suffix}"
    
    def _detect_unit_from_data(self, data: List[Dict[str, Any]], title_lower: str) -> str:
        """Detect the unit of measurement from data labels or context"""
        _ = data
        _ = title_lower
        return ""
    
    def _validate_unit_consistency(self, data_points: List[Dict[str, Any]]) -> bool:
        """Check if all values use compatible units
        
        For multi-series charts, we check consistency within each series separately.
        Different series CAN have different units (e.g., Revenue vs Growth %)
        """
        if len(data_points) < 2:
            return True
        
        # Check if this is multi-series data (has 'series', 'group', or 'dataset' field)
        is_multi_series = any(
            point.get('series') or point.get('group') or point.get('dataset')
            for point in data_points
        )
        
        if is_multi_series:
            # For multi-series, group by series and validate each independently
            series_groups = {}
            for point in data_points:
                series_name = (
                    point.get('series') or 
                    point.get('group') or 
                    point.get('dataset') or 
                    'default'
                )
                if series_name not in series_groups:
                    series_groups[series_name] = []
                series_groups[series_name].append(point)
            
            # Validate each series independently
            for series_name, series_points in series_groups.items():
                if not self._validate_single_series_units(series_points):
                    logger.warning(f"[CHART] Mixed units detected in series '{series_name}'. Rejecting chart.")
                    return False
            
            return True
        else:
            # For single-series, validate all points together
            return self._validate_single_series_units(data_points)
    
    def _validate_single_series_units(self, data_points: List[Dict[str, Any]]) -> bool:
        """Validate unit consistency within a single series - STRICT"""
        if len(data_points) < 2:
            return True
            
        # Enhanced unit patterns - be MORE specific
        unit_patterns = {
            'currency': ['$', '€', '£', 'usd', 'eur', 'dollar', 'million', 'billion', 'revenue', 'sales', 'price', 'cost', 'profit', 'income'],
            'percentage': ['%', 'percent', 'rate', 'ratio', 'share', 'portion', 'growth', 'margin'],
            'count': ['count', 'number', 'units', 'quantity', 'items', 'establishments', 'locations', 'stores', 'shops'],
            'time': ['hours', 'days', 'months', 'years', 'minutes', 'seconds', 'weeks'],
            'space': ['sq', 'square', 'feet', 'meters', 'acres', 'space'],
            'employees': ['employees', 'staff', 'workers', 'jobs', 'team'],
            'bytes': ['kb', 'mb', 'gb', 'tb', 'ram', 'memory', 'storage'],
            'customers': ['users', 'customers', 'clients', 'visitors', 'members']
        }
        
        detected_units = set()
        unit_details = []
        
        for point in data_points:
            label = str(point.get('name', '') + ' ' + point.get('label', '')).lower()
            value = point.get('value', 0)
            
            # Also check value magnitude to detect mixed scales
            point_units = set()
            for unit_type, patterns in unit_patterns.items():
                if any(pattern in label for pattern in patterns):
                    point_units.add(unit_type)
                    unit_details.append(f"{label[:30]}: {unit_type}")
            
            detected_units.update(point_units)
        
        # Allow up to 2 units for dual-axis charts, reject 3+
        if len(detected_units) > 2:
            logger.warning(f"[CHART VALIDATION] REJECTED - Too many units ({len(detected_units)}): {detected_units}")
            logger.warning(f"[CHART VALIDATION] Details: {unit_details[:5]}")
            logger.warning(f"[CHART VALIDATION] Maximum 2 units allowed for dual-axis charts")
            return False
        
        if len(detected_units) == 2:
            logger.info(f"[CHART VALIDATION] Dual-axis chart detected with 2 units: {detected_units}")
            # This is OK for dual Y-axis charts
            return True
        
        # Also check value magnitudes - if one value is 100x another, likely mixed units
        values = [float(p.get('value', 0)) for p in data_points if p.get('value')]
        if values:
            max_val = max(values)
            min_val = min([v for v in values if v > 0], default=1)
            if max_val / min_val > 100:  # More than 100x difference
                logger.warning(f"[CHART VALIDATION] REJECTED - Suspicious value range: {min_val} to {max_val} (100x+ difference suggests mixed units)")
                return False
            
        return True

    def convert_chart_data_to_extracted_data(self, chart_data: ChartData, slide_title: str) -> Dict[str, Any]:
        """Convert ChartData to frontend extractedData format"""
        if not chart_data or not chart_data.data:
            return None
        
        # Map chart types to frontend format
        chart_type_mapping = {
            "bar": "bar",
            "column": "column", 
            "pie": "pie",
            "line": "line",
            "area": "area",
            "scatter": "scatter",
            "spline": "spline",
            "areaspline": "areaspline",
            "waterfall": "waterfall",
            "gauge": "gauge",
            "radar": "radar",
            "sankey": "sankey",
            "treemap": "treemap",
            "sunburst": "sunburst",
            "networkgraph": "networkgraph",
            "heatmap": "heatmap",
            "boxplot": "boxplot",
            "bubble": "bubble"
        }
        
        frontend_type = chart_type_mapping.get(chart_data.chart_type, chart_data.chart_type)
        
        # Normalize data points to {label, name, value} and sanitize labels
        normalized_points: List[Dict[str, Any]] = []
        # Track potential grouping for multi-series
        grouping_key: Optional[str] = None
        for point in chart_data.data:
            if not isinstance(point, dict):
                continue
            # Detect grouping key once, if provided by the model (e.g., series/group/dataset)
            if grouping_key is None:
                for candidate in ("series", "group", "dataset"):
                    if candidate in point:
                        grouping_key = candidate
                        break
            # Extract label from common keys
            label = point.get("label") or point.get("name") or point.get("id") or point.get("x")
            # Extract numeric value from common keys
            value = point.get("value") if "value" in point else point.get("y")
            # Basic validation & coercion
            try:
                if isinstance(value, str):
                    value = float(value.replace(",", "").replace("%", ""))
            except Exception:
                value = None
            # Filter invalid or generic labels
            label_str = (str(label).strip() if label is not None else "")
            label_l = label_str.lower()
            is_generic = (
                not label_str or
                label_l in {"unknown", "n/a", "na", "none", "label", "value"} or
                label_l.startswith("category ") or
                label_l.startswith("item ") or
                label_l.startswith("data point")
            )
            if not is_generic and isinstance(value, (int, float)):
                # Include both label and name for downstream chart libraries
                normalized_points.append({"label": label_str, "name": label_str, "value": float(value)})

        # Require at least 2 valid points to render a chart usefully
        if len(normalized_points) < 2:
            logger.warning("[CHART] Insufficient valid data points after normalization; skipping extractedData conversion")
            return None
            
        # CRITICAL: Validate unit consistency before creating chart
        if not self._validate_unit_consistency(normalized_points):
            logger.warning("[CHART] Mixed units detected in chart data - converting to text instead of chart")
            return None
        
        # Carry forward any citation metadata so frontend can render sources
        metadata = chart_data.metadata or {}
        if 'citations' not in metadata:
            metadata['citations'] = []  # list of {title, url, source}
        # Determine x-axis type (time vs category)
        def _looks_time_like(labels: List[str]) -> bool:
            months = [
                "jan", "feb", "mar", "apr", "may", "jun",
                "jul", "aug", "sep", "oct", "nov", "dec"
            ]
            for lbl in labels:
                l = lbl.lower()
                if any(m in l for m in months):
                    return True
                # Years or YYYY-MM or YYYY/MM or MM/YYYY patterns
                if any(ch in l for ch in ("-", "/")) and any(c.isdigit() for c in l):
                    return True
                if any(str(y) in l for y in range(1990, 2051)):
                    return True
            return False

        labels = [p.get("label", "") for p in normalized_points]
        is_time = chart_data.chart_type in {"line", "area", "spline", "areaspline"} and _looks_time_like(labels)
        x_type = "time" if is_time else "category"

        # Build Highcharts-style series
        series: List[Dict[str, Any]] = []
        # If the original data has grouping info, build multi-series
        if grouping_key:
            groups: Dict[str, List[Dict[str, Any]]] = {}
            for point in chart_data.data:
                if not isinstance(point, dict):
                    continue
                group_name = str(point.get(grouping_key) or "Series 1")
                # Map through the same normalization used above
                label = point.get("label") or point.get("name") or point.get("id") or point.get("x")
                value = point.get("value") if "value" in point else point.get("y")
                try:
                    if isinstance(value, str):
                        value = float(value.replace(",", "").replace("%", ""))
                except Exception:
                    value = None
                label_str = (str(label).strip() if label is not None else "")
                if not label_str or value is None:
                    continue
                groups.setdefault(group_name, []).append({"label": label_str, "value": float(value)})

            for name, pts in groups.items():
                if is_time:
                    data_pts = [{"x": p["label"], "y": p["value"]} for p in pts]
                elif frontend_type == "pie":
                    data_pts = [{"name": p["label"], "y": p["value"]} for p in pts]
                else:
                    data_pts = [{"name": p["label"], "y": p["value"]} for p in pts]
                if len(data_pts) >= 2:
                    series.append({"name": name, "data": data_pts})

        # If no grouping, emit a single-series payload
        if not series:
            if is_time:
                data_pts = [{"x": p["label"], "y": p["value"]} for p in normalized_points]
            elif frontend_type == "pie":
                data_pts = [{"name": p["label"], "y": p["value"]} for p in normalized_points]
            else:
                data_pts = [{"name": p["label"], "y": p["value"]} for p in normalized_points]
            series = [{"name": chart_data.title or "Series 1", "data": data_pts}]

        return {
            "chartType": frontend_type,
            "data": normalized_points,
            "series": series,
            "xType": x_type,
            "title": chart_data.title or slide_title,
            "metadata": metadata
        }
