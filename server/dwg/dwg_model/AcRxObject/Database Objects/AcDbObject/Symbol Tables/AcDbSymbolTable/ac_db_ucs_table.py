from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.classes import AcDbUcsTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbUcsTable(AcDbSymbolTable):
    name: str = "ucs"
    records: Dict[str, AcDbUcsTableRecord] = field(default_factory=dict)
