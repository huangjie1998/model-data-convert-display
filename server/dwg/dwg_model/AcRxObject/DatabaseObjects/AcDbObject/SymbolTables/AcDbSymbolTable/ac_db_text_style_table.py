from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords.AcDbSymbolTableRecord import AcDbTextStyleTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbTextStyleTable(AcDbSymbolTable):
    name: str = "text_styles"
    records: Dict[str, AcDbTextStyleTableRecord] = field(default_factory=dict)
