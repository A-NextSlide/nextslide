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
            "bar": "BAR: Compare categories side-by-side (horizontal bars)",
            "column": "COLUMN: Compare categories vertically (vertical bars)", 
            "pie": "PIE: Show parts of a whole, percentages, distributions",
            "line": "LINE: Show trends over time, continuous data",
            "area": "AREA: Show cumulative totals over time, filled line chart",
            "spline": "SPLINE: Smooth curved line for trends, elegant time series",
            "areaspline": "AREASPLINE: Smooth curved area chart, filled spline",
            "streamgraph": "STREAMGRAPH: Multiple flowing layers over time, organic look",
            "scatter": "SCATTER: Show correlations between two variables, data points",
            "bubble": "BUBBLE: Three-dimensional data (x, y, size), enhanced scatter",
            "packedbubble": "PACKEDBUBBLE: Circular packed bubbles, hierarchical grouping",
            "boxplot": "BOXPLOT: Statistical distribution, quartiles, outliers",
            "errorbar": "ERRORBAR: Data with uncertainty ranges, error margins",
            "gauge": "GAUGE: Single metric display, dashboard-style meter",
            "waterfall": "WATERFALL: Step-by-step changes, cumulative flow",
            "sankey": "SANKEY: Flow between categories, process visualization",
            "pyramid": "PYRAMID: Hierarchical data, population demographics",
            "treemap": "TREEMAP: Hierarchical data as nested rectangles, proportional sizes",
            "sunburst": "SUNBURST: Multi-level hierarchical data, radial tree",
            "networkgraph": "NETWORKGRAPH: Relationships between entities, node connections",
            "dependencywheel": "DEPENDENCYWHEEL: Circular network, interconnected relationships",
            "radar": "RADAR: Multi-dimensional comparison, spider/web chart",
            "heatmap": "HEATMAP: Two-dimensional data intensity, color-coded matrix"
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
        """Determine best chart type based on AI-generated data and context
        
        IMPORTANT: This should RARELY override the AI model's choice.
        The AI model should specify chart_type in the response.
        This is only a fallback for legacy or edge cases.
        """
        
        # Get previously used chart types from context
        used_charts = []
        if context and context.get('used_charts'):
            used_charts = [chart['type'] for chart in context['used_charts']]
        
        # Get available chart types
        available_types = self._get_chart_types_from_registry()
        
        # Analyze the data structure
        data_count = len(data)
        
        # Check if data has multi-series grouping
        has_series_key = any(d.get('series') or d.get('group') or d.get('dataset') for d in data)
        
        # Analyze slide title and content for chart type hints
        title_content_lower = (title + ' ' + content).lower()
        
        # 1. PARTS OF WHOLE - Use pie/donut for distributions
        if data_count <= 10:
            values = [d.get('value', 0) for d in data]
            total = sum(values)
            # Check if it's a percentage breakdown or distribution
            is_distribution = (
                any(word in title_content_lower for word in ['breakdown', 'distribution', 'share', 'composition', 'mix']) or
                (all(0 <= v <= 100 for v in values) and 90 <= total <= 110)  # Percentages
            )
            if is_distribution and not has_series_key:
                if 'pie' in available_types and 'pie' not in used_charts:
                    return 'pie'
                elif 'donut' in available_types:
                    return 'donut'
        
        # 2. FLOW/PROCESS - Use waterfall for sequential changes
        if any(word in title_content_lower for word in ['bridge', 'waterfall', 'flow', 'process', 'funnel', 'stages']):
            if 'waterfall' in available_types and 'waterfall' not in used_charts:
                return 'waterfall'
        
        # 3. TIME SERIES - Use line/area ONLY when clearly temporal
        # Be more strict about time detection - need multiple consecutive time periods
        time_patterns = {
            'quarters': ['q1', 'q2', 'q3', 'q4'],
            'months': ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
            'years': ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']
        }
        
        names_lower = [d.get('name', '').lower() for d in data]
        
        # Check for sequential time periods (not just ANY time mention)
        is_time_series = False
        for pattern_type, patterns in time_patterns.items():
            matches = sum(1 for name in names_lower if any(p in name for p in patterns))
            # Need at least 3 consecutive time periods to be a time series
            if matches >= 3 and data_count >= 3:
                is_time_series = True
                break
        
        # Also check if title/content explicitly mentions trends or time progression
        has_trend_language = any(word in title_content_lower for word in 
            ['trend', 'over time', 'evolution', 'growth over', 'historical', 'projection', 'forecast'])
        
        if (is_time_series or has_trend_language) and data_count >= 4:
            # Vary between line, area, spline based on usage
            if 'line' in available_types and used_charts.count('line') < 2:
                return 'line'
            elif 'area' in available_types and used_charts.count('area') == 0:
                return 'area'
            elif 'spline' in available_types and used_charts.count('spline') == 0:
                return 'spline'
        
        # 4. COMPARISONS - Use bar/column for categorical comparisons
        # This should be the DEFAULT for most data, not line charts!
        comparison_words = ['compare', 'comparison', 'versus', 'vs', 'by region', 'by product', 'by category', 
                          'performance', 'analysis', 'ranking', 'top', 'leading']
        is_comparison = any(word in title_content_lower for word in comparison_words)
        
        if is_comparison or not is_time_series:
            # Use column/bar for comparisons
            # Vary to avoid repetition
            if 'column' in available_types and used_charts.count('column') < 2:
                return 'column'
            elif 'bar' in available_types and used_charts.count('bar') < 2:
                return 'bar'
            # If both used, use radar for multi-dimensional comparisons
            elif data_count >= 5 and has_series_key and 'radar' in available_types and 'radar' not in used_charts:
                return 'radar'
        
        # 5. ADVANCED CHART TYPES based on content
        if 'correlation' in title_content_lower or 'relationship' in title_content_lower:
            if 'scatter' in available_types and 'scatter' not in used_charts:
                return 'scatter'
        
        # 6. Default to column for general comparisons (NOT line!)
        if 'column' in available_types and used_charts.count('column') < 3:
            return 'column'
        elif 'bar' in available_types and used_charts.count('bar') < 3:
            return 'bar'
        
        # 7. Fallback to first available or column
        return 'column' if 'column' in available_types else (available_types[0] if available_types else 'bar')
    
    async def generate_chart_title(
        self, 
        slide_title: str, 
        chart_type: str, 
        data: List[Dict[str, Any]], 
        presentation_title: str
    ) -> str:
        """Generate an appropriate title for the chart with units"""
        
        # Try to extract a meaningful title from the slide title
        title_lower = slide_title.lower()
        
        # Remove common prefixes
        prefixes_to_remove = ['the', 'our', 'your', 'this', 'these', 'a', 'an']
        title_words = slide_title.split()
        if title_words and title_words[0].lower() in prefixes_to_remove:
            title_words = title_words[1:]
        
        cleaned_title = ' '.join(title_words)
        
        # Detect units from data labels or values
        unit = self._detect_unit_from_data(data, title_lower)
        unit_suffix = f" ({unit})" if unit else ""
        
        # Contextual enhancements based on chart type
        if chart_type == "pie":
            if "distribution" not in title_lower and "breakdown" not in title_lower:
                return f"{cleaned_title} Distribution{unit_suffix}"
            return f"{cleaned_title}{unit_suffix}"
        elif chart_type in ["line", "area", "spline"]:
            if "trend" not in title_lower and "over time" not in title_lower:
                return f"{cleaned_title} Trend{unit_suffix}"
            return f"{cleaned_title}{unit_suffix}"
        elif chart_type in ["bar", "column"]:
            if "comparison" not in title_lower:
                return f"{cleaned_title} Comparison{unit_suffix}"
            return f"{cleaned_title}{unit_suffix}"
        elif chart_type == "waterfall":
            if "flow" not in title_lower and "process" not in title_lower:
                return f"{cleaned_title} Flow{unit_suffix}"
            return f"{cleaned_title}{unit_suffix}"
        elif chart_type == "gauge":
            if "performance" not in title_lower:
                return f"{cleaned_title} Performance{unit_suffix}"
            return f"{cleaned_title}{unit_suffix}"
        elif chart_type in ["scatter", "bubble"]:
            if "correlation" not in title_lower:
                return f"{cleaned_title} Analysis{unit_suffix}"
            return f"{cleaned_title}{unit_suffix}"
        
        # If the slide title is already descriptive, use it as is
        return f"{cleaned_title}{unit_suffix}"
    
    def _detect_unit_from_data(self, data: List[Dict[str, Any]], title_lower: str) -> str:
        """Detect the unit of measurement from data labels or context"""
        if not data or len(data) == 0:
            return ""
        
        # Check title for unit indicators
        if any(word in title_lower for word in ['revenue', 'sales', 'profit', 'cost', 'price']):
            # Check if it mentions billions, millions, thousands
            if 'billion' in title_lower or '$b' in title_lower:
                return "$B"
            elif 'million' in title_lower or '$m' in title_lower:
                return "$M"
            elif 'thousand' in title_lower or '$k' in title_lower:
                return "$K"
            else:
                return "$"
        
        # Check for percentage indicators
        if any(word in title_lower for word in ['percent', 'share', 'rate', 'growth', 'margin']):
            return "%"
        
        # Check for count indicators
        if any(word in title_lower for word in ['units', 'count', 'number of', 'quantity']):
            return "Units"
        
        # Check data labels for unit patterns
        sample_labels = ' '.join([str(d.get('name', '')) for d in data[:5]]).lower()
        
        # Currency patterns
        if '$' in sample_labels or 'usd' in sample_labels or 'dollar' in sample_labels:
            if 'million' in sample_labels or 'mm' in sample_labels:
                return "$M"
            elif 'billion' in sample_labels:
                return "$B"
            else:
                return "$"
        
        # Percentage patterns
        if '%' in sample_labels or 'percent' in sample_labels:
            return "%"
        
        # Time-based - no unit needed
        if any(word in sample_labels for word in ['q1', 'q2', 'jan', 'feb', 'month', 'quarter']):
            return ""
        
        # Check data values to infer units
        values = [d.get('value', 0) for d in data]
        if values and len(values) > 0:
            avg_value = sum(values) / len(values)
            total = sum(values)
            
            # If values sum to ~100 and all small, likely percentages
            if all(0 <= v <= 100 for v in values) and 90 <= total <= 110:
                return "%"
            
            # Large numbers suggest millions
            elif avg_value > 1000000:
                return "$M"
            elif avg_value > 100000:
                return "$K"
        
        # Default: no unit
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
        """Validate unit consistency within a single series"""
        if len(data_points) < 2:
            return True
            
        # Extract potential unit indicators from names/labels
        unit_patterns = {
            'currency': ['$', '€', '£', 'usd', 'eur', 'dollars', 'million', 'billion', 'revenue', 'sales', 'price', 'cost'],
            'percentage': ['%', 'percent', 'rate', 'share', 'portion', 'growth'],
            'count': ['count', 'number', 'units', 'quantity', 'items'],
            'time': ['hours', 'days', 'months', 'years', 'minutes', 'seconds'],
            'bytes': ['kb', 'mb', 'gb', 'tb', 'ram', 'memory', 'storage'],
            'physical': ['colors', 'palette', 'weight', 'height', 'length', 'size'],
            'other': ['users', 'customers', 'employees', 'downloads', 'views']
        }
        
        detected_units = set()
        for point in data_points:
            label = str(point.get('name', '') + ' ' + point.get('label', '')).lower()
            for unit_type, patterns in unit_patterns.items():
                if any(pattern in label for pattern in patterns):
                    detected_units.add(unit_type)
                    break
        
        # If multiple unit types detected in a SINGLE series, that's problematic
        if len(detected_units) > 1:
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