from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.classes import AcDbBlockTableRecord, AcDbBlockTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbBlockTable(AcDbSymbolTable):
    name: str = "blocks"
    records: Dict[str, AcDbBlockTableRecord] = field(default_factory=dict)
