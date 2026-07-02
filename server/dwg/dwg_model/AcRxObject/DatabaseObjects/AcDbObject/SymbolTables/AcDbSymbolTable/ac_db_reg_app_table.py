from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from server.dwg.dwg_model.AcRxObject.DatabaseObjects.AcDbObject.SymbolTableRecords.AcDbSymbolTableRecord import AcDbRegAppTableRecord

from ..ac_db_symbol_table import AcDbSymbolTable


@dataclass
class AcDbRegAppTable(AcDbSymbolTable):
    name: str = "appids"
    records: Dict[str, AcDbRegAppTableRecord] = field(default_factory=dict)
