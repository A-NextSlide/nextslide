import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.outline.chart_generator import ChartGenerator
from services.outline.models import StructuredSlideOutput
from services.outline.slide_generator import SlideGenerator


def test_parse_structured_output_extracts_fields():
    generator = SlideGenerator(ChartGenerator())
    model = StructuredSlideOutput(
        content="• Insight",
        chartData=[{"name": "A", "value": 10}],
        chartType="bar",
    )
    result = {"model": model, "citations": [{"title": "Source", "url": "https://example.com"}]}

    content, chart_data, chart_type, citations = generator._parse_structured_output(result)

    assert content == "• Insight"
    assert chart_type == "bar"
    assert chart_data == [{"name": "A", "value": 10}]
    assert citations[0]["url"] == "https://example.com"


def test_build_structured_extracted_data_returns_payload():
    generator = SlideGenerator(ChartGenerator())
    chart_data = [
        {"name": "A", "value": 10},
        {"name": "B", "value": 15},
        {"name": "C", "value": 12},
    ]

    extracted = generator._build_structured_extracted_data("Slide", "bar", chart_data)

    assert extracted is not None
    assert extracted["chartType"] == "bar"
    assert len(extracted["data"]) == 3
