from __future__ import annotations

<<<<<<< HEAD
from typing import Optional

=======
>>>>>>> feat/sprint2-embed-pipeline
from app.extractors.base import BaseExtractor
from app.extractors.text import PlainTextExtractor
from app.extractors.pdf import PdfExtractor
from app.extractors.docx import DocxExtractor
from app.extractors.xlsx import XlsxExtractor
from app.extractors.csv import CsvExtractor
from app.extractors.markdown import MarkdownExtractor
from app.extractors.image import ImageExtractor
from app.extractors.html import HtmlExtractor

_EXTRACTORS: dict[str, BaseExtractor] = {}


def _register_all():
    for cls in [
        PlainTextExtractor,
        PdfExtractor,
        DocxExtractor,
        XlsxExtractor,
        CsvExtractor,
        MarkdownExtractor,
        ImageExtractor,
        HtmlExtractor,
    ]:
        instance = cls()
        for mime in instance.supported_mime_types:
            _EXTRACTORS[mime] = instance


_register_all()


def get_extractor(mime_type: Optional[str]) -> Optional[BaseExtractor]:
    if not mime_type:
        return None
    return _EXTRACTORS.get(mime_type.split(";")[0].strip())
