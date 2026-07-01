from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from ..ac_db_symbol_table_record import AcDbSymbolTableRecord


@dataclass
class AcDbLayerTableRecord(AcDbSymbolTableRecord):
    color_index: int | None = None
    color_rgb: str = ""
    linetype: str = ""
    lineweight_mm: float | None = None
    properties: Dict[str, object] = field(default_factory=dict)
