"""XLSX and CSV text extractors."""

import asyncio
import csv
import io
from pathlib import Path

from app.extractors.base import BaseExtractor


class XlsxExtractor(BaseExtractor):
    """Extract text from Excel (.xlsx) and CSV files.

    For XLSX files, iterates all sheets and all rows, joining cells
    with tab separators and rows with newlines.

    For CSV files, reads all rows using the standard csv module and
    joins cells with tab separators.
    """

    supported_mime_types = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    ]

    async def extract(self, file_path: Path) -> str:
        """Extract text content from an XLSX or CSV file.

        Args:
            file_path: Path to the spreadsheet or CSV file on disk.

        Returns:
            All cell values joined by tabs (within rows) and newlines
            (between rows and sheets).

        Raises:
            ExtractionError: If the file cannot be read or parsed.
        """
        mime = self._detect_mime(file_path)
        if mime == "csv":
            return await asyncio.to_thread(self._extract_csv, file_path)
        return await asyncio.to_thread(self._extract_xlsx, file_path)

    def _detect_mime(self, file_path: Path) -> str:
        """Detect whether file should be treated as csv or xlsx by extension.

        Args:
            file_path: Path to inspect.

        Returns:
            ``"csv"`` for .csv files, ``"xlsx"`` for everything else.
        """
        if file_path.suffix.lower() == ".csv":
            return "csv"
        return "xlsx"

    def _extract_xlsx(self, file_path: Path) -> str:
        """Extract text from an Excel workbook.

        Args:
            file_path: Path to the .xlsx file.

        Returns:
            All cell values from all sheets as a tab/newline delimited string.
        """
        import openpyxl

        wb = openpyxl.load_workbook(str(file_path), read_only=True, data_only=True)
        lines: list[str] = []

        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                row_text = "\t".join(str(cell) if cell is not None else "" for cell in row)
                if row_text.strip():
                    lines.append(row_text)

        wb.close()
        return "\n".join(lines)

    def _extract_csv(self, file_path: Path) -> str:
        """Extract text from a CSV file.

        Args:
            file_path: Path to the CSV file.

        Returns:
            All rows joined by newlines, cells separated by tabs.
        """
        lines: list[str] = []
        with open(file_path, newline="", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            for row in reader:
                row_text = "\t".join(row)
                if row_text.strip():
                    lines.append(row_text)
        return "\n".join(lines)
