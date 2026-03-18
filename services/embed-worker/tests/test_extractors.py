"""Tests for file text extractors."""

import csv
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.extractors.text import PlainTextExtractor
from app.extractors.pdf import PdfExtractor
from app.extractors.docx import DocxExtractor
from app.extractors.xlsx import XlsxExtractor
from app.extractors.csv import CsvExtractor
from app.extractors.markdown import MarkdownExtractor
from app.extractors.image import ImageExtractor
from app.extractors.html import HtmlExtractor
from app.extractors.registry import get_extractor
from app.utils.errors import ExtractionError


# ---------------------------------------------------------------------------
# PlainText / Markdown
# ---------------------------------------------------------------------------


async def test_plain_text_extractor_returns_content():
    """PlainTextExtractor should return the exact content of a .txt file."""
    extractor = PlainTextExtractor()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write("Hello, world!")
        tmp_path = Path(f.name)

    try:
        result = await extractor.extract(tmp_path)
        assert result == "Hello, world!"
    finally:
        tmp_path.unlink(missing_ok=True)


async def test_markdown_extractor_strips_nothing():
    """PlainTextExtractor should return raw markdown content unchanged."""
    extractor = PlainTextExtractor()
    markdown_content = "# Title\n\n- item 1\n- item 2\n"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write(markdown_content)
        tmp_path = Path(f.name)

    try:
        result = await extractor.extract(tmp_path)
        assert result == markdown_content
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


async def test_pdf_extractor_handles_missing_file():
    """PdfExtractor should raise an exception for a non-existent file path."""
    extractor = PdfExtractor()
    non_existent = Path("/tmp/does_not_exist_kms_test.pdf")
    with pytest.raises(Exception):
        await extractor.extract(non_existent)


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------


async def test_docx_extractor_returns_paragraphs():
    """DocxExtractor should extract paragraph text from an in-memory docx."""
    docx = pytest.importorskip("docx", reason="python-docx not installed")

    doc = docx.Document()
    doc.add_paragraph("First paragraph")
    doc.add_paragraph("Second paragraph")

    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
        tmp_path = Path(f.name)

    try:
        doc.save(str(tmp_path))
        extractor = DocxExtractor()
        result = await extractor.extract(tmp_path)
        assert "First paragraph" in result
        assert "Second paragraph" in result
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# XLSX / CSV
# ---------------------------------------------------------------------------


async def test_xlsx_extractor_returns_cell_values():
    """XlsxExtractor should extract cell values from all sheets of a workbook."""
    openpyxl = pytest.importorskip("openpyxl", reason="openpyxl not installed")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws["A1"] = "alpha"
    ws["B1"] = "beta"
    ws["A2"] = "gamma"

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
        tmp_path = Path(f.name)

    try:
        wb.save(str(tmp_path))
        extractor = XlsxExtractor()
        result = await extractor.extract(tmp_path)
        assert "alpha" in result
        assert "beta" in result
        assert "gamma" in result
    finally:
        tmp_path.unlink(missing_ok=True)


async def test_csv_extractor_returns_rows():
    """XlsxExtractor should extract all rows from a CSV file."""
    extractor = XlsxExtractor()
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, newline="", encoding="utf-8"
    ) as f:
        writer = csv.writer(f)
        writer.writerow(["name", "value"])
        writer.writerow(["foo", "42"])
        tmp_path = Path(f.name)

    try:
        result = await extractor.extract(tmp_path)
        assert "name" in result
        assert "foo" in result
        assert "42" in result
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Image OCR
# ---------------------------------------------------------------------------


async def test_image_extractor_handles_no_tesseract():
    """ImageExtractor should return empty string when Tesseract is not found."""
    import io

    PIL = pytest.importorskip("PIL", reason="Pillow not installed")
    from PIL import Image

    # Create a tiny valid PNG in a temp file
    img = Image.new("RGB", (10, 10), color=(255, 255, 255))
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        tmp_path = Path(f.name)
    img.save(str(tmp_path))

    try:
        import pytesseract

        class _FakeTesseractNotFoundError(Exception):
            pass

        # Patch the exception class and image_to_string
        with (
            patch.object(
                pytesseract,
                "TesseractNotFoundError",
                _FakeTesseractNotFoundError,
            ),
            patch.object(
                pytesseract,
                "image_to_string",
                side_effect=_FakeTesseractNotFoundError("not found"),
            ),
        ):
            extractor = ImageExtractor()
            result = await extractor.extract(tmp_path)
            assert result == ""
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------


async def test_html_extractor_strips_script_tags():
    """HtmlExtractor should exclude <script> content but keep <p> text."""
    html_content = (
        "<html><head><script>alert('xss')</script></head>"
        "<body><p>Visible text</p></body></html>"
    )
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".html", delete=False, encoding="utf-8"
    ) as f:
        f.write(html_content)
        tmp_path = Path(f.name)

    try:
        extractor = HtmlExtractor()
        result = await extractor.extract(tmp_path)
        assert "Visible text" in result
        assert "alert" not in result
        assert "xss" not in result
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# CSV (dedicated extractor)
# ---------------------------------------------------------------------------


async def test_csv_extractor_returns_raw_content():
    """CsvExtractor should return the raw CSV file contents unchanged."""
    extractor = CsvExtractor()
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, newline="", encoding="utf-8"
    ) as f:
        writer = csv.writer(f)
        writer.writerow(["header1", "header2"])
        writer.writerow(["value1", "value2"])
        tmp_path = Path(f.name)

    try:
        result = await extractor.extract(tmp_path)
        assert "header1" in result
        assert "value1" in result
        assert "value2" in result
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Markdown (dedicated extractor)
# ---------------------------------------------------------------------------


async def test_markdown_extractor_returns_raw_content():
    """MarkdownExtractor should return the raw markdown content unchanged."""
    extractor = MarkdownExtractor()
    markdown = "# Heading\n\nSome **bold** text and _italics_.\n"
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".md", delete=False, encoding="utf-8"
    ) as f:
        f.write(markdown)
        tmp_path = Path(f.name)

    try:
        result = await extractor.extract(tmp_path)
        assert result == markdown
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


def test_registry_returns_csv_extractor_for_text_csv():
    """get_extractor('text/csv') should return a CsvExtractor instance."""
    extractor = get_extractor("text/csv")
    assert extractor is not None
    assert isinstance(extractor, CsvExtractor)


def test_registry_returns_csv_extractor_for_application_csv():
    """get_extractor('application/csv') should return a CsvExtractor instance."""
    extractor = get_extractor("application/csv")
    assert extractor is not None
    assert isinstance(extractor, CsvExtractor)


def test_registry_returns_pdf_extractor_for_application_pdf():
    """get_extractor('application/pdf') should return a PdfExtractor instance."""
    from app.extractors.pdf import PdfExtractor

    extractor = get_extractor("application/pdf")
    assert extractor is not None
    assert isinstance(extractor, PdfExtractor)


def test_registry_returns_markdown_extractor_for_text_markdown():
    """get_extractor('text/markdown') should return a MarkdownExtractor instance."""
    extractor = get_extractor("text/markdown")
    assert extractor is not None
    assert isinstance(extractor, MarkdownExtractor)


def test_registry_returns_none_for_unknown_mime_type():
    """get_extractor should return None for an unregistered MIME type."""
    extractor = get_extractor("application/x-totally-unknown-type")
    assert extractor is None


def test_registry_returns_none_for_none_input():
    """get_extractor(None) should return None without raising."""
    extractor = get_extractor(None)
    assert extractor is None


def test_registry_strips_charset_from_mime_type():
    """get_extractor should correctly handle 'text/plain; charset=utf-8' by stripping the param."""
    extractor = get_extractor("text/plain; charset=utf-8")
    assert extractor is not None
    assert isinstance(extractor, PlainTextExtractor)
