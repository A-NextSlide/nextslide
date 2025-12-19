"""Helpers to normalize legacy chart payloads into extractedData format."""

from typing import Any, Dict, List, Optional


def _as_dict(value: Any) -> Any:
    """Convert Pydantic-like objects to dicts if possible."""
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return value


def _coerce_number(value: Any) -> Optional[float]:
    """Best-effort numeric coercion for chart values."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace("%", "").strip()
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _normalize_point(
    point: Dict[str, Any],
    series_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    label = point.get("label") or point.get("name") or point.get("id") or point.get("x")
    value = point.get("value") if "value" in point else point.get("y")
    coerced = _coerce_number(value)
    if label is None or coerced is None:
        return None

    label_str = str(label).strip()
    if not label_str:
        return None

    normalized: Dict[str, Any] = {
        "label": label_str,
        "name": label_str,
        "value": coerced,
    }
    series = series_name or point.get("series") or point.get("group") or point.get("dataset")
    if series:
        normalized["series"] = series
    if "x" in point:
        normalized["x"] = point.get("x")
    if "y" in point:
        normalized["y"] = point.get("y")
    return normalized


def _flatten_series(series_list: Any) -> List[Dict[str, Any]]:
    """Flatten Highcharts-style series payloads into data points."""
    if not isinstance(series_list, list):
        return []
    flattened: List[Dict[str, Any]] = []
    for series in series_list:
        if not isinstance(series, dict):
            continue
        series_name = series.get("name") or series.get("id") or "Series"
        points = series.get("data") or []
        if not isinstance(points, list):
            continue
        for point in points:
            if isinstance(point, dict):
                normalized = _normalize_point(point, series_name=series_name)
                if normalized:
                    flattened.append(normalized)
            elif isinstance(point, (list, tuple)) and len(point) >= 2:
                # Handle [x, y] points
                normalized = _normalize_point(
                    {"x": point[0], "y": point[1]},
                    series_name=series_name,
                )
                if normalized:
                    flattened.append(normalized)
    return flattened


def normalize_chart_points(raw_points: Any) -> List[Dict[str, Any]]:
    """Normalize raw chart points into extractedData-compatible points."""
    if not raw_points:
        return []
    if isinstance(raw_points, dict) and raw_points.get("series"):
        return _flatten_series(raw_points.get("series"))
    if isinstance(raw_points, list):
        normalized: List[Dict[str, Any]] = []
        for point in raw_points:
            if isinstance(point, dict):
                normalized_point = _normalize_point(point)
                if normalized_point:
                    normalized.append(normalized_point)
            elif isinstance(point, (list, tuple)) and len(point) >= 2:
                normalized_point = _normalize_point({"x": point[0], "y": point[1]})
                if normalized_point:
                    normalized.append(normalized_point)
        return normalized
    return []


def normalize_extracted_data(
    raw_data: Any,
    fallback_title: Optional[str] = None,
    source: str = "legacy",
) -> Optional[Dict[str, Any]]:
    """Normalize chart_data/chartData/extractedData payload into extractedData."""
    raw_data = _as_dict(raw_data)
    if not raw_data or not isinstance(raw_data, dict):
        return None

    # If raw_data already looks like extractedData
    if "chartType" in raw_data and "data" in raw_data:
        points = normalize_chart_points(raw_data.get("data"))
        if not points:
            return None
        return {
            "source": raw_data.get("source") or source,
            "chartType": raw_data.get("chartType"),
            "data": points,
            "title": raw_data.get("title") or fallback_title,
            "metadata": raw_data.get("metadata") or {},
            "dualAxis": raw_data.get("dualAxis", False),
        }

    # Legacy snake_case chart_data
    if "chart_type" in raw_data or "chartType" in raw_data:
        chart_type = raw_data.get("chart_type") or raw_data.get("chartType")
        points = normalize_chart_points(raw_data.get("data") or raw_data.get("series"))
        if not points:
            return None
        return {
            "source": raw_data.get("source") or source,
            "chartType": chart_type,
            "data": points,
            "title": raw_data.get("title") or fallback_title,
            "metadata": raw_data.get("metadata") or {},
            "dualAxis": raw_data.get("dualAxis", False),
        }

    # chartData as list with chartType nearby
    if "chartData" in raw_data:
        points = normalize_chart_points(raw_data.get("chartData"))
        if not points:
            return None
        return {
            "source": raw_data.get("source") or source,
            "chartType": raw_data.get("chartType") or raw_data.get("chart_type"),
            "data": points,
            "title": raw_data.get("title") or fallback_title,
            "metadata": raw_data.get("metadata") or {},
            "dualAxis": raw_data.get("dualAxis", False),
        }

    return None


def normalize_slide_chart_fields(slide: Dict[str, Any]) -> None:
    """Normalize chart fields on a slide dict in-place to extractedData only."""
    if not isinstance(slide, dict):
        return

    fallback_title = slide.get("title")

    extracted = normalize_extracted_data(slide.get("extractedData"), fallback_title)
    if not extracted:
        extracted = normalize_extracted_data(slide.get("chart_data"), fallback_title)
    if not extracted:
        extracted = normalize_extracted_data(slide.get("chartData"), fallback_title)

    if extracted:
        slide["extractedData"] = extracted

    # Remove legacy fields if present
    if "chart_data" in slide:
        slide.pop("chart_data", None)
    if "chartData" in slide:
        slide.pop("chartData", None)
