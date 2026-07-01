from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.classes import AcDbLinetypeTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbLinetypeTable(AcDbSymbolTable):
    name: str = "linetypes"
    records: Dict[str, AcDbLinetypeTableRecord] = field(default_factory=dict)
