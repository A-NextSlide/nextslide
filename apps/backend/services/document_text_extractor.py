"""Helpers for extracting readable text from uploaded document bytes."""

from __future__ import annotations

from io import BytesIO
import re
import zipfile
from xml.etree import ElementTree


_DOC_EXTENSIONS = (".doc", ".docx", ".txt", ".md", ".markdown", ".rst")
_TEXT_EXTENSIONS = (".txt", ".md", ".markdown", ".rst")
_OOXML_ARTIFACT_MARKERS = (
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/styles.xml",
    "docProps/core.xml",
)


def is_document_file(filename: str = "", file_type: str = "") -> bool:
    """Return True when this looks like a document/text file."""
    filename_lower = (filename or "").lower()
    file_type_lower = (file_type or "").lower()
    if filename_lower.endswith(_DOC_EXTENSIONS):
        return True
    if file_type_lower.startswith("text/"):
        return True
    return "word" in file_type_lower or "document" in file_type_lower


def extract_text_from_document_bytes(
    raw_bytes: bytes,
    *,
    filename: str = "",
    file_type: str = "",
    max_chars: int = 60000,
) -> str:
    """Extract readable text from document bytes (.docx, text-like files)."""
    if not raw_bytes:
        return ""

    filename_lower = (filename or "").lower()
    file_type_lower = (file_type or "").lower()

    is_docx = (
        filename_lower.endswith(".docx")
        or "wordprocessingml.document" in file_type_lower
    )
    is_text_file = filename_lower.endswith(_TEXT_EXTENSIONS) or file_type_lower.startswith("text/")

    if is_docx:
        return _extract_docx_text(raw_bytes, max_chars=max_chars)

    if is_text_file:
        return _normalize_text(_decode_text_bytes(raw_bytes), max_chars=max_chars)

    # Legacy .doc binaries are not reliably parseable without external tooling.
    if filename_lower.endswith(".doc"):
        return ""

    # Conservative fallback: decode if readable, but reject OOXML container artifacts.
    decoded = _decode_text_bytes(raw_bytes)
    if _looks_like_ooxml_artifacts(decoded):
        return ""
    return _normalize_text(decoded, max_chars=max_chars)


def _extract_docx_text(docx_bytes: bytes, *, max_chars: int) -> str:
    try:
        with zipfile.ZipFile(BytesIO(docx_bytes), "r") as archive:
            names = set(archive.namelist())
            if "word/document.xml" not in names:
                return ""

            # Main body first, then headers/footers for completeness.
            xml_paths = ["word/document.xml"]
            xml_paths.extend(sorted(name for name in names if name.startswith("word/header") and name.endswith(".xml")))
            xml_paths.extend(sorted(name for name in names if name.startswith("word/footer") and name.endswith(".xml")))

            paragraphs: list[str] = []
            for xml_path in xml_paths:
                try:
                    xml_bytes = archive.read(xml_path)
                    paragraphs.extend(_extract_paragraphs_from_word_xml(xml_bytes))
                except Exception:
                    continue

            text = "\n\n".join(paragraphs)
            return _normalize_text(text, max_chars=max_chars)
    except Exception:
        return ""


def _extract_paragraphs_from_word_xml(xml_bytes: bytes) -> list[str]:
    root = ElementTree.fromstring(xml_bytes)
    paragraphs: list[str] = []

    for paragraph in root.iter():
        if _local_name(paragraph.tag) != "p":
            continue

        chunks: list[str] = []
        for node in paragraph.iter():
            local = _local_name(node.tag)
            if local == "t" and node.text:
                chunks.append(node.text)
            elif local == "tab":
                chunks.append("\t")
            elif local in ("br", "cr"):
                chunks.append("\n")

        text = "".join(chunks).strip()
        if text:
            paragraphs.append(text)

    return paragraphs


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _decode_text_bytes(raw_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return raw_bytes.decode(encoding)
        except Exception:
            continue
    return raw_bytes.decode("utf-8", errors="ignore")


def _looks_like_ooxml_artifacts(text: str) -> bool:
    if not text:
        return False
    marker_hits = sum(1 for marker in _OOXML_ARTIFACT_MARKERS if marker in text)
    if marker_hits >= 1:
        return True
    if text.count("<?xml") >= 2 and ("_rels" in text or "word/" in text):
        return True
    return False


def _normalize_text(text: str, *, max_chars: int) -> str:
    if not text:
        return ""

    cleaned = (
        text.replace("\x00", "")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
    )
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = cleaned.strip()

    if not cleaned:
        return ""
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars] + "\n[TRUNCATED]"
