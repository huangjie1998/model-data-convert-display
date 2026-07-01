from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.classes import AcDbDimStyleTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbDimStyleTable(AcDbSymbolTable):
    name: str = "dim_styles"
    records: Dict[str, AcDbDimStyleTableRecord] = field(default_factory=dict)
