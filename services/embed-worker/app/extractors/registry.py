from app.extractors.base import BaseExtractor
from app.extractors.text import PlainTextExtractor
from app.extractors.pdf import PdfExtractor

_EXTRACTORS: dict[str, BaseExtractor] = {}

def _register_all():
    for cls in [PlainTextExtractor, PdfExtractor]:
        instance = cls()
        for mime in instance.supported_mime_types:
            _EXTRACTORS[mime] = instance

_register_all()

def get_extractor(mime_type: str | None) -> BaseExtractor | None:
    if not mime_type:
        return None
    return _EXTRACTORS.get(mime_type.split(";")[0].strip())
