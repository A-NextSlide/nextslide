import pytest
from pydantic import ValidationError

from api.requests.api_public_v1 import (
    CreateDeckRequest,
    _get_api_request_hash,
    _get_slide_mode_from_deck,
)


def test_create_deck_request_normalizes_slide_mode_aliases():
    default_request = CreateDeckRequest.model_validate({"topic": "Quarterly review"})
    traditional_request = CreateDeckRequest.model_validate(
        {"topic": "Quarterly review", "slide_mode": "traditional"}
    )
    nextgen_request = CreateDeckRequest.model_validate(
        {"topic": "Quarterly review", "slideMode": "nextgen"}
    )

    assert default_request.slide_mode == "interactive"
    assert traditional_request.slide_mode == "static"
    assert nextgen_request.slide_mode == "interactive"


def test_create_deck_request_rejects_invalid_slide_mode():
    with pytest.raises(ValidationError):
        CreateDeckRequest.model_validate(
            {"topic": "Quarterly review", "slide_mode": "unsupported"}
        )


def test_get_slide_mode_from_deck_prefers_persisted_metadata_then_outline():
    assert _get_slide_mode_from_deck({"data": {"slide_mode": "traditional"}}) == "static"
    assert _get_slide_mode_from_deck(
        {"outline": {"stylePreferences": {"slideMode": "static"}}}
    ) == "static"
    assert _get_slide_mode_from_deck({}) == "interactive"


def test_api_request_hash_distinguishes_slide_mode_and_outputs():
    base = _get_api_request_hash(
        "user-1",
        "Quarterly review",
        10,
        "corporate",
        "Keep it sharp",
        "interactive",
        {"pdf": True, "image": False, "iframe": True},
    )
    static_variant = _get_api_request_hash(
        "user-1",
        "Quarterly review",
        10,
        "corporate",
        "Keep it sharp",
        "static",
        {"pdf": True, "image": False, "iframe": True},
    )
    outputs_variant = _get_api_request_hash(
        "user-1",
        "Quarterly review",
        10,
        "corporate",
        "Keep it sharp",
        "interactive",
        {"pdf": False, "image": False, "iframe": True},
    )

    assert base != static_variant
    assert base != outputs_variant
