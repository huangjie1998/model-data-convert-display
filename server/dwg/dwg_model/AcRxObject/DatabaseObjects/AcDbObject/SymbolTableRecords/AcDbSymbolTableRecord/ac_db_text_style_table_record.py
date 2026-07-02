from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from ..ac_db_symbol_table_record import AcDbSymbolTableRecord


@dataclass
class AcDbTextStyleTableRecord(AcDbSymbolTableRecord):
    font_name: str = ""
    bigfont_name: str = ""
    font_key: str = ""
    bigfont_key: str = ""
    properties: Dict[str, object] = field(default_factory=dict)
