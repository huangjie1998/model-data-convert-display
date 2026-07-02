from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords.AcDbSymbolTableRecord import AcDbBlockTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbBlockTable(AcDbSymbolTable):
    name: str = "blocks"
    records: Dict[str, AcDbBlockTableRecord] = field(default_factory=dict)
