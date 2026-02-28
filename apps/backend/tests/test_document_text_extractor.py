import os
import sys
import zipfile
from io import BytesIO
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.document_text_extractor import (
    extract_text_from_document_bytes,
    is_document_file,
)


def _build_docx_bytes(paragraphs: list[str]) -> bytes:
    body = "".join(
        f"<w:p><w:r><w:t>{escape(text)}</w:t></w:r></w:p>"
        for text in paragraphs
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body>"
        "</w:document>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("word/document.xml", document_xml)
    return buf.getvalue()


def test_extract_docx_text_reads_document_content_not_container_structure():
    raw = _build_docx_bytes(
        [
            "NextSlide Architecture Overview",
            "This chapter explains modular services and orchestration.",
        ]
    )

    text = extract_text_from_document_bytes(
        raw,
        filename="guide.docx",
        file_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    assert "NextSlide Architecture Overview" in text
    assert "modular services" in text
    assert "[Content_Types].xml" not in text
    assert "_rels/.rels" not in text


def test_extract_text_from_plain_text_file():
    raw = b"Chapter 1\nCore Concepts\n"
    text = extract_text_from_document_bytes(raw, filename="notes.txt", file_type="text/plain")
    assert "Chapter 1" in text
    assert "Core Concepts" in text


def test_extract_text_rejects_ooxml_artifact_fallback_text():
    artifact = (
        "[Content_Types].xml\n_rels/.rels\nword/document.xml\n"
        "<?xml version='1.0'?>\n"
    ).encode("utf-8")
    text = extract_text_from_document_bytes(artifact, filename="unknown.bin", file_type="application/octet-stream")
    assert text == ""


def test_is_document_file_detects_word_and_text_formats():
    assert is_document_file(filename="sample.docx")
    assert is_document_file(filename="notes.md")
    assert is_document_file(file_type="text/plain")
    assert is_document_file(file_type="application/msword")
