import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.requests.api_deck_create_stream import _extract_status_state


def test_extract_status_state_from_dict():
    assert _extract_status_state({"state": "completed", "progress": 100}) == "completed"


def test_extract_status_state_from_string():
    assert _extract_status_state("generating") == "generating"


def test_extract_status_state_invalid_shapes():
    assert _extract_status_state({"progress": 50}) is None
    assert _extract_status_state(123) is None
    assert _extract_status_state(None) is None
