from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Dict, List

from setup_logging_optimized import get_logger
from services.pptx_text_extractor import extract_pptx_text_from_bytes

logger = get_logger(__name__)


@dataclass(frozen=True)
class FileScan:
    pptx_files: List[Dict[str, Any]]
    has_images: bool
    assistant_eligible: bool


def _is_image(file_info: Dict[str, Any]) -> bool:
    return (file_info.get("type") or "").startswith("image/")


def _is_pptx(file_info: Dict[str, Any]) -> bool:
    name = (file_info.get("name") or "").lower()
    ftype = (file_info.get("type") or "").lower()
    return name.endswith((".pptx", ".ppt")) or "presentation" in ftype


def _is_spreadsheet_or_csv(ftype: str, fname: str) -> bool:
    fname_l = (fname or "").lower()
    return (
        ftype in (
            "text/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        or fname_l.endswith((".csv", ".xlsx", ".xls"))
    )


def _is_pdf(ftype: str, fname: str) -> bool:
    return ftype == "application/pdf" or (fname or "").lower().endswith(".pdf")


def scan_files(files: List[Dict[str, Any]]) -> FileScan:
    pptx_files = [f for f in files if _is_pptx(f)]
    has_images = any(_is_image(f) for f in files)
    assistant_eligible = any(
        _is_spreadsheet_or_csv(f.get("type", ""), f.get("name", ""))
        or _is_pdf(f.get("type", ""), f.get("name", ""))
        for f in files
    )
    return FileScan(
        pptx_files=pptx_files,
        has_images=has_images,
        assistant_eligible=assistant_eligible,
    )


def decode_file_bytes(content: Any) -> bytes:
    if isinstance(content, str):
        b64 = content.split(";base64,", 1)[1] if content.startswith("data:") and ";base64," in content else content
        try:
            return base64.b64decode(b64)
        except Exception as exc:
            logger.warning("Failed to decode base64 content: %s", exc)
            return b""
    return content or b""


def extract_pptx_outlines(pptx_files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    outlines: List[Dict[str, Any]] = []
    for f in pptx_files:
        file_bytes = decode_file_bytes(f.get("content"))
        if not file_bytes:
            continue
        extracted = extract_pptx_text_from_bytes(file_bytes)
        outlines.append({
            "filename": f.get("name", "presentation.pptx"),
            "slides": extracted.get("slides", []),
            "slide_count": extracted.get("slide_count", 0),
        })
    return outlines


def append_pptx_titles_to_prompt(prompt: str, pptx_outlines: List[Dict[str, Any]], max_titles: int = 12) -> str:
    if not pptx_outlines:
        return prompt
    titles = [s.get("title", "") for s in pptx_outlines[0].get("slides", []) if s.get("title")]
    if not titles:
        return prompt
    suffix = "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:max_titles])
    return f"{prompt}{suffix}"


def filter_assistant_files(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [f for f in files if not _is_image(f) and not _is_pptx(f)]
